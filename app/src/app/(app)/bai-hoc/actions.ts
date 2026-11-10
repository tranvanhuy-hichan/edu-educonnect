"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { createExercise as createExerciseService, createLessonPost, updateLessonPost, deleteLessonPost, updateExercise as updateExerciseService, deleteExercise as deleteExerciseService, gradeSubmission as gradeSubmissionService, submitAssignment } from "@/modules/content/content.service";

import { attachmentLinks as parseLinks } from "@/lib/storage/validation";

const TEACH = [...MANAGER_ROLES, ...TEACHING_ROLES];

export const createPost = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const title = str(fd, "title"), content = str(fd, "content");
  const links = parseLinks(str(fd, "attachments"));
  if (!title || (!content && !links.length)) throw new Error("Nhập tiêu đề và nội dung hoặc tải tệp bài học");
  const post = await createLessonPost(me, {
    assignmentId: str(fd, "assignmentId"), title, content,
    attachments: links.length ? links : undefined,
  });
  await audit(me.email, "create_lesson_post", "LessonPost", post.id);
  revalidatePath("/bai-hoc");
  revalidatePath("/lop-cua-toi", "layout");
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
export const createExercise = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || (!content && !str(fd, "attachments"))) throw new Error("Nhập tiêu đề và đề bài hoặc tải tệp bài tập");
  const due = opt(fd, "dueDate");
  const links = parseLinks(str(fd, "attachments"));
  const lessonPostId = str(fd, "lessonPostId");
  const ex = await createExerciseService(me, { lessonPostId, title, content, quizMode: false, attachments: links.length ? links : undefined, dueDate: due ? new Date(due) : undefined });
  await audit(me.email, "create_exercise", "Exercise", ex.id);
  revalidatePath(`/bai-hoc/${lessonPostId}`);
  revalidatePath("/bai-hoc");
  return "Đã thêm bài tập";
});

export const updateExercise = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const id = str(fd, "id");
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || (!content && !str(fd, "attachments"))) throw new Error("Nhập tiêu đề và đề bài hoặc tải tệp bài tập");
  const due = opt(fd, "dueDate");
  const links = parseLinks(str(fd, "attachments"));
  const ex = await updateExerciseService(me, id, { title, content, attachments: links, dueDate: due ? new Date(due) : null });
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
