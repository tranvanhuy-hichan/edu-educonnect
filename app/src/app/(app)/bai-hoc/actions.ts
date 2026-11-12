"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { createExercise as createExerciseService, createLessonPosts, updateLessonPost, deleteLessonPost, updateExercise as updateExerciseService, deleteExercise as deleteExerciseService, gradeSubmission as gradeSubmissionService, submitAssignment } from "@/modules/content/content.service";

import { attachmentLinks as parseLinks } from "@/lib/storage/validation";
import { parseNumber } from "@/modules/question/question.grading";
import { reportViolation as reportViolationService, startAttempt as startAttemptService, addQuestionsToExercise, lessonPostOfExercise, lessonPostOfExerciseQuestion, moveExerciseQuestion, removeExerciseQuestion, resetQuizSubmission, submitQuiz, updateExerciseQuestionPoints } from "@/modules/question/quiz.service";

const TEACH = [...MANAGER_ROLES, ...TEACHING_ROLES];

export const createPost = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const title = str(fd, "title"), content = str(fd, "content");
  const links = parseLinks(str(fd, "attachments"));
  if (!title || (!content && !links.length)) throw new Error("Nhập tiêu đề và nội dung hoặc tải tệp bài học");
  const assignmentIds = fd.getAll("assignmentIds").map(String).filter(Boolean);
  const posts = await createLessonPosts(me, { assignmentIds: assignmentIds.length ? assignmentIds : [str(fd, "assignmentId")], title, content, attachments: links.length ? links : undefined });
  for (const post of posts) await audit(me.email, "create_lesson_post", "LessonPost", post.id);
  revalidatePath("/bai-hoc");
  revalidatePath("/lop-cua-toi", "layout");
  return posts.length > 1 ? `Đã đăng bài học cho ${posts.length} lớp` : "Đã đăng bài học";
});

export const updatePost = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const id = str(fd, "id");
  const title = str(fd, "title"), content = str(fd, "content");
  const links = parseLinks(str(fd, "attachments"));
  if (!title || (!content && !links.length)) throw new Error("Nhập tiêu đề và nội dung hoặc tải tệp bài học");
  await updateLessonPost(me, id, { title, content, attachments: links });
  revalidatePath("/bai-hoc");
  revalidatePath(`/bai-hoc/${id}`);
});

export const deletePost = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const post = await deleteLessonPost(me, str(fd, "id"));
  await audit(me.email, "delete_lesson_post", "LessonPost", post.id);
  revalidatePath("/bai-hoc");
  revalidatePath("/lop-cua-toi", "layout");
  redirect("/bai-hoc");
});

/** Bài tập luôn thuộc một bài học: tạo/sửa/xoá ngay trong tab "Bài tập" của bài học. */
const secureOf = (fd: FormData) => str(fd, "secureMode") === "1";
const shuffleQOf = (fd: FormData) => str(fd, "shuffleQuestions") === "1";
const shuffleOOf = (fd: FormData) => str(fd, "shuffleOptions") === "1";
const intIn = (fd: FormData, k: string, min: number, max: number, d: number) => { const n = parseInt(str(fd, k).replace(/\D/g, ""), 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const attemptSettings = (fd: FormData) => ({ maxAttempts: intIn(fd, "maxAttempts", 1, 10, 1), attemptScoring: str(fd, "attemptScoring") === "LAST" ? ("LAST" as const) : ("BEST" as const), timeLimitMinutes: intIn(fd, "timeLimitMinutes", 0, 600, 0), allowReview: str(fd, "allowReview") === "1" });
const maxViolationsOf = (fd: FormData) => { const n = parseInt(str(fd, "maxViolations").replace(/\D/g, ""), 10); return Number.isFinite(n) ? Math.min(n, 20) : undefined; };
const showAnswersOf = (fd: FormData) => {
  const v = str(fd, "showAnswers");
  return v === "AFTER_SUBMIT" || v === "AFTER_DUE" || v === "NEVER" ? v : undefined;
};

export const createExercise = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const title = str(fd, "title"), content = str(fd, "content");
  const quizMode = str(fd, "quizMode") === "1";
  if (!title || (!quizMode && !content && !str(fd, "attachments"))) throw new Error("Nhập tiêu đề và đề bài hoặc tải tệp bài tập");
  const due = opt(fd, "dueDate");
  const links = parseLinks(str(fd, "attachments"));
  const lessonPostId = str(fd, "lessonPostId");
  const ex = await createExerciseService(me, { lessonPostId, title, content, quizMode, showAnswers: showAnswersOf(fd), secureMode: quizMode ? secureOf(fd) : undefined, maxViolations: maxViolationsOf(fd), shuffleQuestions: quizMode ? shuffleQOf(fd) : undefined, shuffleOptions: quizMode ? shuffleOOf(fd) : undefined, ...(quizMode ? attemptSettings(fd) : {}), attachments: links.length ? links : undefined, dueDate: due ? new Date(due) : undefined });
  await audit(me.email, "create_exercise", "Exercise", ex.id);
  revalidatePath(`/bai-hoc/${lessonPostId}`);
  revalidatePath("/bai-hoc");
  if (quizMode) redirect(`/bai-hoc/${lessonPostId}?tab=bai-tap&ex=${ex.id}`); // vào luôn trang bài tập để thêm câu hỏi
  return "Đã thêm bài tập";
});

export const updateExercise = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const id = str(fd, "id");
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title) throw new Error("Nhập tiêu đề bài tập");
  const due = opt(fd, "dueDate");
  const links = parseLinks(str(fd, "attachments"));
  const ex = await updateExerciseService(me, id, { title, content, attachments: links, dueDate: due ? new Date(due) : null, showAnswers: showAnswersOf(fd), secureMode: secureOf(fd), maxViolations: maxViolationsOf(fd), shuffleQuestions: shuffleQOf(fd), shuffleOptions: shuffleOOf(fd), ...attemptSettings(fd) });
  revalidatePath(`/bai-hoc/${ex.lessonPostId}`);
  return "Đã lưu bài tập";
});

export const deleteExercise = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const ex = await deleteExerciseService(me, str(fd, "id"));
  await audit(me.email, "delete_exercise", "Exercise", ex.id);
  revalidatePath(`/bai-hoc/${ex.lessonPostId}`);
  revalidatePath("/bai-hoc");
  redirect(`/bai-hoc/${ex.lessonPostId}?tab=bai-tap`);
});

export const submitWork = wrap(async (fd) => {
  const me = await assertRole("STUDENT");
  const content = str(fd, "content");
  const attachments = parseLinks(str(fd, "attachments"));
  if (!content && !attachments.length) throw new Error("Nhập bài làm hoặc tải tệp");
  const exerciseId = str(fd, "exerciseId");
  await submitAssignment(me, exerciseId, content, attachments);
  revalidatePath("/bai-hoc", "layout");
  revalidatePath("/bai-hoc");
  return "Đã nộp bài";
});

export const gradeWork = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const grade = Number(str(fd, "grade").replace(",", "."));
  if (!Number.isFinite(grade) || grade < 0 || grade > 10) throw new Error("Điểm phải từ 0 đến 10");
  await gradeSubmissionService(me, str(fd, "submissionId"), grade, opt(fd, "feedback") ?? undefined);
  revalidatePath("/bai-hoc", "layout");
  return "Đã chấm điểm";
});

/* ===================== Bài tập trắc nghiệm ===================== */
const exerciseOf = lessonPostOfExercise;
const refreshQuiz = (lessonPostId?: string | null) => { revalidatePath("/bai-hoc", "layout"); if (lessonPostId) revalidatePath(`/bai-hoc/${lessonPostId}`); };

export const addQuizQuestions = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const exerciseId = str(fd, "exerciseId");
  const points = parseNumber(str(fd, "points") || "1");
  const added = await addQuestionsToExercise(me, exerciseId, fd.getAll("questionIds").map(String), points);
  refreshQuiz(await exerciseOf(exerciseId));
  return added ? `Đã thêm ${added} câu hỏi` : "Các câu hỏi đã có trong bài tập";
});

const eqLesson = lessonPostOfExerciseQuestion;

export const setQuizPoints = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const id = str(fd, "id");
  await updateExerciseQuestionPoints(me, id, parseNumber(str(fd, "points")));
  refreshQuiz(await eqLesson(id));
  return "Đã lưu điểm";
});

export const moveQuizQuestion = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const id = str(fd, "id");
  await moveExerciseQuestion(me, id, str(fd, "dir") === "-1" ? -1 : 1);
  refreshQuiz(await eqLesson(id));
  return "Đã đổi thứ tự";
});

export const removeQuizQuestion = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const id = str(fd, "id");
  const lesson = await eqLesson(id);
  await removeExerciseQuestion(me, id);
  refreshQuiz(lesson);
  return "Đã bỏ câu hỏi khỏi bài tập";
});

function parseQuizAnswers(fd: FormData) {
  const answers: Record<string, { optionId?: string; text?: string; picks?: Record<string, boolean> }> = {};
  for (const [key, raw] of fd.entries()) {
    if (typeof raw !== "string") continue;
    if (key.startsWith("a_")) answers[key.slice(2)] = { ...answers[key.slice(2)], optionId: raw, text: raw };
    else if (key.startsWith("tf__")) {
      const [, qid, oid] = key.split("__");
      if (qid && oid && (raw === "T" || raw === "F")) answers[qid] = { ...answers[qid], picks: { ...answers[qid]?.picks, [oid]: raw === "T" } };
    }
  }
  return answers;
}

/** Học sinh nộp bài trắc nghiệm: gom đáp án từ form thành { [questionId]: { optionId, text, picks } } rồi chấm tự động. */
export const submitQuizWork = wrap(async (fd) => {
  const me = await assertRole("STUDENT");
  const answers = parseQuizAnswers(fd);
  const exerciseId = str(fd, "exerciseId");
  const sub = await submitQuiz(me, exerciseId, answers, { autoSubmitted: str(fd, "autoSubmitted") === "1" });
  refreshQuiz(await exerciseOf(exerciseId));
  const fmt = (n: number | null) => String(n ?? 0).replace(".", ",");
  return sub.counted ? `Đã nộp bài. Điểm của em: ${fmt(sub.attemptGrade)}/10` : `Đã nộp bài. Điểm lần này: ${fmt(sub.attemptGrade)}/10 (điểm đang được tính vẫn là ${fmt(sub.grade)}/10)`;
});

export const resetQuiz = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const ex = await resetQuizSubmission(me, str(fd, "submissionId"));
  await audit(me.email, "reset_quiz_submission", "Exercise", ex.id);
  refreshQuiz(ex.lessonPostId);
  return "Đã cho học sinh làm lại";
});

/** Máy học sinh báo một vi phạm khi đang làm bài thi nghiêm túc. Trả về số vi phạm hiện có và việc có phải tự nộp bài. */
export async function reportViolation(exerciseId: string, type: string, detail?: string, answers?: FormData): Promise<{ count: number; max: number; exceeded: boolean } | { error: string }> {
  try {
    const me = await assertRole("STUDENT");
    return await reportViolationService(me, exerciseId, type, detail ?? null, answers ? parseQuizAnswers(answers) : {});
  } catch (e) {
    return { error: (e as Error).message || "Không ghi nhận được vi phạm" };
  }
}

/** Học sinh bấm "Bắt đầu làm bài" (bài có giờ làm bài hoặc thi nghiêm túc): máy chủ ghi giờ bắt đầu để tính giờ và đếm lượt. */
export async function startAttempt(exerciseId: string): Promise<{ attemptNo: number; startedAt: string; serverNow: string; timeLimitMinutes: number } | { error: string }> {
  try {
    const me = await assertRole("STUDENT");
    return await startAttemptService(me, exerciseId);
  } catch (e) {
    return { error: (e as Error).message || "Không bắt đầu được bài làm" };
  }
}
