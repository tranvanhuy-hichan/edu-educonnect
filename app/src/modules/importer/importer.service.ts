import type { SessionUser } from "@/lib/auth/session";
import { uploadLimit } from "@/lib/storage/config";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import { uploadFile } from "@/modules/files/files.service";
import { parseDocx } from "./docx-parser";
import { anthropicExtractor, ImportError, type ExtractInput, type Extractor } from "./extractor";
import * as repo from "./importer.repository";
import { normalizeQuestion, type NormalizedQuestion } from "./normalize";

export type ImportKind = "QUESTIONS" | "TEST";
export const ALLOWED_EXTENSIONS = ["docx", "pdf", "txt", "png", "jpg", "jpeg", "webp"] as const;
const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const dailyLimit = () => {
  const n = Number(process.env.AI_IMPORT_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 20;
};
const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

function requireTeacher(user: SessionUser) {
  if (!user.teacherId) throw new ForbiddenError("Chỉ giáo viên mới nhập được câu hỏi từ tệp");
  return user.teacherId;
}

export type CreateImportInput = { kind: string; subjectId: string; gradeLevelId: string; libraryLessonId: string | null; fileName: string; buffer: Buffer };

/** Kiểm tra yêu cầu, lưu tệp gốc và tạo phiên nhập (PENDING). Việc đọc bằng AI chạy sau bằng runImportJob. */
export async function createImportJob(user: SessionUser, input: CreateImportInput) {
  const teacherId = requireTeacher(user);
  if (input.kind !== "QUESTIONS" && input.kind !== "TEST") throw new ConflictError("Loại nhập không hợp lệ");
  const ext = extOf(input.fileName);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) throw new ConflictError("Chỉ nhận tệp Word (.docx), PDF, văn bản (.txt) hoặc ảnh (.png, .jpg, .webp). Tệp .doc cũ hãy lưu lại thành .docx.");
  if (!input.buffer.length) throw new ConflictError("Tệp không có dữ liệu");
  if (input.buffer.length > uploadLimit()) throw new ConflictError(`Tệp không được quá ${uploadLimit() / 1024 / 1024} MB`);
  if (!(await repo.hasSubject(teacherId, input.subjectId))) throw new ForbiddenError("Bạn không phụ trách môn này");
  if (!(await repo.findGrade(input.gradeLevelId))) throw new ConflictError("Chọn khối cho phiên nhập");
  if (input.libraryLessonId) {
    const lesson = await repo.findLesson(input.libraryLessonId);
    if (!lesson || lesson.teacherId !== teacherId || lesson.archivedAt) throw new ForbiddenError("Không tìm thấy bài học trong kho của bạn");
    if (lesson.subjectId !== input.subjectId || lesson.gradeLevelId !== input.gradeLevelId) throw new ConflictError("Bài học phải cùng môn và cùng khối với phiên nhập");
  }
  const limit = dailyLimit();
  if ((await repo.countJobsSince(teacherId, new Date(Date.now() - 24 * 3600_000))) >= limit) throw new ConflictError(`Đã đạt giới hạn ${limit} lần nhập bằng AI trong 24 giờ. Vui lòng thử lại sau.`);

  const saved = await uploadFile(user, { assignmentId: null, purpose: "IMPORT", exerciseId: null, name: input.fileName, buffer: input.buffer });
  return repo.createJob({
    teacherId, kind: input.kind, status: "PENDING", fileName: saved.name, fileId: saved.id,
    subjectId: input.subjectId, gradeLevelId: input.gradeLevelId, libraryLessonId: input.libraryLessonId,
  });
}

const failMessage = (e: unknown) => {
  if (e instanceof ImportError || e instanceof ConflictError) return e.message;
  console.error("[importer] job failed", e);
  return "Không xử lý được tệp. Hãy kiểm tra tệp (không đặt mật khẩu, không hỏng) rồi thử lại.";
};

/** Hàng đợi nền: đọc tệp -> AI trích xuất -> chuẩn hóa -> lưu. Mọi lỗi được ghi vào phiên (FAILED), không ném ra ngoài. */
export async function runImportJob(user: SessionUser, jobId: string, buffer: Buffer, extractor: Extractor = anthropicExtractor): Promise<void> {
  const job = await repo.findJob(jobId);
  if (!job || job.teacherId !== user.teacherId) return;
  await repo.updateJob(jobId, { status: "RUNNING", error: null });
  try {
    const ext = extOf(job.fileName);
    const warnings: string[] = [];
    let images: Awaited<ReturnType<typeof parseDocx>>["images"] = [];
    let source: ExtractInput["source"];
    if (ext === "docx") {
      const parsed = await parseDocx(buffer);
      if (!parsed.text.trim() && !parsed.images.length) throw new ImportError("Tệp Word không có nội dung để đọc.");
      images = parsed.images;
      source = { type: "text", text: parsed.text, imageCount: parsed.images.length };
    } else if (ext === "txt") {
      const text = buffer.toString("utf8").trim();
      if (!text) throw new ImportError("Tệp văn bản trống.");
      source = { type: "text", text, imageCount: 0 };
    } else if (ext === "pdf") source = { type: "pdf", data: buffer, mime: "application/pdf" };
    else source = { type: "image", data: buffer, mime: IMAGE_MIME[ext] ?? "image/png" };

    const extracted = await extractor({ kind: job.kind as ImportKind, fileName: job.fileName, subjectName: job.subject.subjectName, gradeName: job.gradeLevel.gradeName, source });
    warnings.push(...extracted.warnings);

    // ảnh nhúng dùng được (PNG/JPG/WebP, không quá giới hạn dung lượng)
    const usable = new Map(images.filter((i) => i.supported && i.data.length <= uploadLimit()).map((i) => [i.n, i]));
    for (const i of images) if (!usable.has(i.n)) warnings.push(`Ảnh ${i.n} (${i.name}) có định dạng hoặc dung lượng không hỗ trợ nên không nhập được, cần thêm thủ công.`);
    const available = new Set(usable.keys());

    const normalized: NormalizedQuestion[] = [];
    let dropped = 0;
    for (const q of extracted.questions) {
      const refsOk = [...q.imageRefs, ...q.options.flatMap((o) => o.imageRefs)].every((n) => available.has(n));
      const n = normalizeQuestion(refsOk ? q : { ...q, needsFigure: true }, available);
      if (n) normalized.push(n); else dropped++;
    }
    if (dropped) warnings.push(`Bỏ qua ${dropped} câu rỗng.`);
    if (!normalized.length) throw new ImportError("Không tìm thấy câu hỏi nào trong tệp. Hãy kiểm tra tệp có phải là đề/tập câu hỏi và đọc được không.");

    // tải ảnh dùng trong câu hỏi lên (mỗi ảnh một lần)
    const urls = new Map<number, string>();
    const urlOf = async (n: number) => {
      const hit = urls.get(n);
      if (hit) return hit;
      const img = usable.get(n)!;
      const saved = await uploadFile(user, { assignmentId: null, purpose: "QUESTION", exerciseId: null, name: `import-${n}-${img.name}`, buffer: img.data });
      urls.set(n, saved.url);
      return saved.url;
    };
    const resolved: repo.ResolvedQuestion[] = [];
    for (const q of normalized) {
      resolved.push({ ...q, imageUrls: await Promise.all(q.imageRefs.map(urlOf)), optionImageUrls: await Promise.all(q.options.map((o) => Promise.all(o.imageRefs.map(urlOf)))) });
    }

    await repo.saveImportResult({
      jobId, teacherId: job.teacherId, subjectId: job.subjectId, gradeLevelId: job.gradeLevelId, libraryLessonId: job.libraryLessonId, kind: job.kind as ImportKind,
      testTitle: extracted.testTitle, fileName: job.fileName, questions: resolved, warnings,
    });
  } catch (e) {
    await repo.updateJob(jobId, { status: "FAILED", error: failMessage(e), finishedAt: new Date() }).catch((err) => console.error("[importer] cannot record failure", err));
  }
}

export async function listImportJobs(user: SessionUser) {
  return repo.listJobs(requireTeacher(user));
}

/** Chỉ chủ phiên được xem. */
export async function getImportJob(user: SessionUser, id: string) {
  const teacherId = requireTeacher(user);
  const job = await repo.findJob(id);
  if (!job || job.teacherId !== teacherId) return null;
  return { job, questions: await repo.jobQuestions(id) };
}

export async function approveImportQuestions(user: SessionUser, jobId: string, questionId?: string) {
  const teacherId = requireTeacher(user);
  const job = await repo.findJob(jobId);
  if (!job || job.teacherId !== teacherId) throw new ForbiddenError("Không tìm thấy phiên nhập");
  return (await repo.approveQuestions(teacherId, jobId, questionId)).count;
}
