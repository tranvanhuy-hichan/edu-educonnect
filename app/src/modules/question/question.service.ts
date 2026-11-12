import type { SessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/session";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import { validateFileReferences } from "@/lib/storage/files";
import { questionInputSchema, type QuestionInput } from "./question.schema";
import * as repo from "./question.repository";
import { findLesson } from "@/modules/bank/bank.repository";

/** Ngân hàng câu hỏi là của riêng từng giáo viên: chỉ chủ sở hữu được sửa/xóa. Ban giám hiệu/quản trị chỉ xem. */
function requireTeacher(user: SessionUser) {
  if (!user.teacherId) throw new ForbiddenError("Chỉ giáo viên mới soạn được câu hỏi");
  return user.teacherId;
}

async function parseInput(user: SessionUser, raw: unknown): Promise<QuestionInput> {
  const teacherId = requireTeacher(user);
  const parsed = questionInputSchema.safeParse(raw);
  if (!parsed.success) throw new ConflictError(parsed.error.issues[0]?.message ?? "Câu hỏi không hợp lệ");
  const input = parsed.data;
  const subjects = await repo.teacherSubjects(teacherId);
  if (!subjects.some((s) => s.subjectId === input.subjectId)) throw new ForbiddenError("Bạn không phụ trách môn này");
  if (input.libraryLessonId) {
    const lesson = await findLesson(input.libraryLessonId);
    if (!lesson || lesson.archivedAt || lesson.teacherId !== teacherId) throw new ForbiddenError("Bài học không tồn tại hoặc không phải của bạn");
    if (lesson.subjectId !== input.subjectId || lesson.gradeLevelId !== input.gradeLevelId) throw new ConflictError("Bài học phải cùng môn và cùng khối với câu hỏi");
  }
  const urls = [...input.images, ...input.options.flatMap((o) => o.images)];
  await validateFileReferences(user, urls, "", "QUESTION");
  return input;
}

export async function createQuestion(user: SessionUser, raw: unknown) {
  const input = await parseInput(user, raw);
  return repo.createQuestion(user.teacherId!, input);
}

/** Câu hỏi đã được dùng trong bài tập có học sinh nộp thì không sửa tại chỗ (điểm cũ phải giữ nguyên): tạo phiên bản mới và lưu trữ câu cũ. */
export async function updateQuestion(user: SessionUser, id: string, raw: unknown) {
  const q = await repo.findQuestion(id);
  if (!q || q.archivedAt || q.teacherId !== user.teacherId) throw new ForbiddenError("Không tìm thấy câu hỏi hoặc không có quyền sửa");
  const input = await parseInput(user, raw);
  if (await repo.countSubmittedUsage(id)) return { question: await repo.versionQuestion(id, q.teacherId, input), versioned: true };
  return { question: await repo.replaceQuestion(id, q.teacherId, input), versioned: false };
}

export async function deleteQuestion(user: SessionUser, id: string) {
  const q = await repo.findQuestion(id);
  if (!q || q.archivedAt || q.teacherId !== user.teacherId) throw new ForbiddenError("Không tìm thấy câu hỏi hoặc không có quyền xóa");
  await repo.deleteOrArchive(id, user.email);
}

export async function listQuestions(user: SessionUser, filter: repo.QuestionFilter, skip: number, take: number) {
  if (!user.teacherId && !isAdmin(user)) throw new ForbiddenError();
  return repo.listQuestions({ ...filter, teacherId: user.teacherId ?? filter.teacherId }, skip, take);
}

export async function getQuestion(user: SessionUser, id: string) {
  const q = await repo.findQuestion(id);
  if (!q || (q.teacherId !== user.teacherId && !isAdmin(user))) return null;
  return q;
}

/** Số câu theo môn + khối (chọn môn → khối) và số câu AI đang chờ duyệt. */
export async function bankOverview(user: SessionUser) {
  if (!user.teacherId) throw new ForbiddenError();
  const [counts, review] = await Promise.all([repo.countByGrade(user.teacherId), repo.countNeedsReview(user.teacherId)]);
  return { counts, review };
}

/** Duyệt (xác nhận đã kiểm tra) các câu AI trích xuất. */
export async function approveQuestions(user: SessionUser, ids: string[]) {
  if (!user.teacherId) throw new ForbiddenError("Chỉ giáo viên mới duyệt được câu hỏi");
  return repo.markReady(user.teacherId, ids);
}
