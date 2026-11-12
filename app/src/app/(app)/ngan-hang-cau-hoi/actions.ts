"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { attachmentLinks as parseLinks } from "@/lib/storage/validation";
import { parseNumber } from "@/modules/question/question.grading";
import { approveQuestions, createQuestion, deleteQuestion as deleteQuestionService, updateQuestion } from "@/modules/question/question.service";

const TEACH = [...MANAGER_ROLES, ...TEACHING_ROLES];

/** Đọc form của trình soạn câu hỏi thành dữ liệu thô; kiểm tra hợp lệ do service/zod đảm nhiệm. */
function readForm(fd: FormData) {
  const type = str(fd, "type");
  let options: { uid: string; content: string; isCorrect: boolean }[] = [];
  try { options = JSON.parse(str(fd, "options") || "[]"); } catch { throw new Error("Dữ liệu đáp án không hợp lệ"); }
  if (!Array.isArray(options)) throw new Error("Dữ liệu đáp án không hợp lệ");
  const lines = str(fd, "ansAnswers").split("\n").map((x) => x.trim()).filter(Boolean);
  return {
    type,
    subjectId: str(fd, "subjectId"),
    gradeLevelId: str(fd, "gradeLevelId"),
    libraryLessonId: opt(fd, "libraryLessonId"),
    topic: opt(fd, "topic"),
    difficulty: str(fd, "difficulty") || "MEDIUM",
    content: str(fd, "content"),
    images: parseLinks(str(fd, "images")),
    explanation: opt(fd, "explanation"),
    options: type === "SHORT_ANSWER" ? [] : options.map((o) => ({ content: String(o.content ?? "").trim(), isCorrect: o.isCorrect === true, images: parseLinks(str(fd, `opt_img_${String(o.uid)}`)) })),
    answerKey: type === "SHORT_ANSWER" ? { mode: str(fd, "ansMode") === "NUMBER" ? "NUMBER" : "TEXT", answers: lines, tolerance: Math.max(0, parseNumber(str(fd, "ansTol")) || 0) } : null,
  };
}

export const saveQuestion = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const id = str(fd, "id");
  const raw = readForm(fd);
  if (!id) {
    const q = await createQuestion(me, raw);
    await audit(me.email, "create_question", "Question", q.id);
    revalidatePath("/ngan-hang-cau-hoi");
    revalidatePath("/ngan-hang-bai-hoc", "layout");
    const back = str(fd, "returnTo");
    const ctx = new URLSearchParams({ subjectId: raw.subjectId, gradeLevelId: raw.gradeLevelId, ...(raw.libraryLessonId ? { lessonId: raw.libraryLessonId } : {}) });
    redirect(back.startsWith("/") && !back.startsWith("//") ? back : `/ngan-hang-cau-hoi?${ctx}`);
  }
  const { question, versioned } = await updateQuestion(me, id, raw);
  await audit(me.email, "update_question", "Question", question.id);
  revalidatePath("/ngan-hang-cau-hoi");
  revalidatePath("/bai-hoc", "layout");
  revalidatePath("/ngan-hang-bai-hoc", "layout");
  if (versioned) redirect(`/ngan-hang-cau-hoi/${question.id}`);
  return "Đã lưu câu hỏi";
});

export const deleteQuestion = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const id = str(fd, "id");
  await deleteQuestionService(me, id);
  await audit(me.email, "delete_question", "Question", id);
  revalidatePath("/ngan-hang-cau-hoi");
  return "Đã xóa câu hỏi";
});

export const approveQuestion = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const n = await approveQuestions(me, [str(fd, "id")]);
  revalidatePath("/ngan-hang-cau-hoi");
  revalidatePath("/ngan-hang-bai-hoc", "layout");
  return n.count ? "Đã duyệt câu hỏi" : "Không tìm thấy câu hỏi";
});
