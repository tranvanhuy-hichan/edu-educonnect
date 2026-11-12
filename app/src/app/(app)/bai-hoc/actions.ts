"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { createExercise as createExerciseService, createLessonPosts, updateLessonPost, deleteLessonPost, updateExercise as updateExerciseService, deleteExercise as deleteExerciseService, gradeSubmission as gradeSubmissionService, submitAssignment } from "@/modules/content/content.service";

import { attachmentLinks as parseLinks } from "@/lib/storage/validation";
import { parseNumber } from "@/modules/question/question.grading";
import { addQuestionsToExercise, lessonPostOfExercise, lessonPostOfExerciseQuestion, moveExerciseQuestion, removeExerciseQuestion, resetQuizSubmission, submitQuiz, updateExerciseQuestionPoints } from "@/modules/question/quiz.service";

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
  const ex = await createExerciseService(me, { lessonPostId, title, content, quizMode, showAnswers: showAnswersOf(fd), attachments: links.length ? links : undefined, dueDate: due ? new Date(due) : undefined });
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
  const ex = await updateExerciseService(me, id, { title, content, attachments: links, dueDate: due ? new Date(due) : null, showAnswers: showAnswersOf(fd) });
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

/** Học sinh nộp bài trắc nghiệm: gom đáp án từ form thành { [questionId]: { optionId, text, picks } } rồi chấm tự động. */
export const submitQuizWork = wrap(async (fd) => {
  const me = await assertRole("STUDENT");
  const answers: Record<string, { optionId?: string; text?: string; picks?: Record<string, boolean> }> = {};
  for (const [key, raw] of fd.entries()) {
    if (typeof raw !== "string") continue;
    if (key.startsWith("a_")) answers[key.slice(2)] = { ...answers[key.slice(2)], optionId: raw, text: raw };
    else if (key.startsWith("tf__")) {
      const [, qid, oid] = key.split("__");
      if (qid && oid && (raw === "T" || raw === "F")) answers[qid] = { ...answers[qid], picks: { ...answers[qid]?.picks, [oid]: raw === "T" } };
    }
  }
  const exerciseId = str(fd, "exerciseId");
  const sub = await submitQuiz(me, exerciseId, answers);
  refreshQuiz(await exerciseOf(exerciseId));
  return `Đã nộp bài. Điểm của em: ${String(sub.grade).replace(".", ",")}/10`;
});

export const resetQuiz = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const ex = await resetQuizSubmission(me, str(fd, "submissionId"));
  await audit(me.email, "reset_quiz_submission", "Exercise", ex.id);
  refreshQuiz(ex.lessonPostId);
  return "Đã cho học sinh làm lại";
});
