"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { createExercise as createExerciseService, createLessonPost, gradeSubmission as gradeSubmissionService, submitAssignment } from "@/modules/content/content.service";

const TEACH = [...MANAGER_ROLES, ...TEACHING_ROLES];

/** Mỗi dòng một đường dẫn http/https. */
function parseLinks(raw: string) {
  const links = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  for (const l of links) if (!/^https?:\/\//.test(l)) throw new Error(`Đường dẫn không hợp lệ: ${l}`);
  return links;
}

async function postOwner(me: Awaited<ReturnType<typeof assertRole>>, postId: string) {
  const post = await db.lessonPost.findUniqueOrThrow({ where: { id: postId } });
  if (!(await canManageClassSubjectAssignment(me, post.assignmentId))) throw new Error("Bạn không phụ trách lớp-môn này");
  return post;
}

export const createPost = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || !content) throw new Error("Nhập tiêu đề và nội dung");
  const links = parseLinks(str(fd, "attachments"));
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
  const post = await postOwner(me, str(fd, "id"));
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || !content) throw new Error("Nhập tiêu đề và nội dung");
  await db.lessonPost.update({
    where: { id: post.id },
    data: { title, content, attachments: parseLinks(str(fd, "attachments")) },
  });
  revalidatePath("/bai-hoc");
  revalidatePath(`/bai-hoc/${post.id}`);
});

/** Xoá toàn bộ dữ liệu của các bài tập thuộc bài học (câu hỏi, bài nộp...). */
const wipeExercises = (where: { lessonPostId?: string; id?: string }) => [
  db.studentAnswer.deleteMany({ where: { OR: [{ submission: { exercise: where } }, { question: { exercise: where } }] } }),
  db.assignmentSubmission.deleteMany({ where: { exercise: where } }),
  db.questionOption.deleteMany({ where: { question: { exercise: where } } }),
  db.question.deleteMany({ where: { exercise: where } }),
  db.exercise.deleteMany({ where }),
];

export const deletePost = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const post = await postOwner(me, str(fd, "id"));
  await db.$transaction([
    ...wipeExercises({ lessonPostId: post.id }),
    db.lessonPostView.deleteMany({ where: { lessonPostId: post.id } }),
    db.lessonPost.delete({ where: { id: post.id } }),
  ]);
  await audit(me.email, "delete_lesson_post", "LessonPost", post.id);
  revalidatePath("/bai-hoc");
  revalidatePath("/lop-cua-toi", "layout");
  redirect("/bai-hoc");
});

/** Bài tập luôn thuộc một bài học: tạo/sửa/xoá ngay trong tab "Bài tập" của bài học. */
export const createExercise = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || !content) throw new Error("Nhập tiêu đề và đề bài");
  const due = opt(fd, "dueDate");
  const links = parseLinks(str(fd, "attachments"));
  const lessonPostId = str(fd, "lessonPostId");
  const ex = await createExerciseService(me, { lessonPostId, title, content, quizMode: false, attachments: links.length ? links : undefined, dueDate: due ? new Date(due) : undefined });
  await audit(me.email, "create_exercise", "Exercise", ex.id);
  revalidatePath(`/bai-hoc/${lessonPostId}`);
  revalidatePath("/bai-hoc");
  return "Đã thêm bài tập";
});

async function exerciseOwner(me: Awaited<ReturnType<typeof assertRole>>, id: string) {
  const ex = await db.exercise.findUniqueOrThrow({ where: { id }, include: { lessonPost: true } });
  if (!(await canManageClassSubjectAssignment(me, ex.lessonPost.assignmentId))) throw new Error("Bạn không phụ trách lớp-môn này");
  return ex;
}

export const updateExercise = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const ex = await exerciseOwner(me, str(fd, "id"));
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || !content) throw new Error("Nhập tiêu đề và đề bài");
  const due = opt(fd, "dueDate");
  await db.exercise.update({ where: { id: ex.id }, data: { title, content, attachments: parseLinks(str(fd, "attachments")), dueDate: due ? new Date(due) : null } });
  revalidatePath(`/bai-hoc/${ex.lessonPostId}`);
  return "Đã lưu bài tập";
});

export const deleteExercise = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const ex = await exerciseOwner(me, str(fd, "id"));
  await db.$transaction(wipeExercises({ id: ex.id }));
  await audit(me.email, "delete_exercise", "Exercise", ex.id);
  revalidatePath(`/bai-hoc/${ex.lessonPostId}`);
  revalidatePath("/bai-hoc");
  redirect(`/bai-hoc/${ex.lessonPostId}?tab=bai-tap`);
});

export const submitWork = wrap(async (fd) => {
  const me = await assertRole("STUDENT");
  const content = str(fd, "content");
  if (!content) throw new Error("Nhập bài làm");
  const exerciseId = str(fd, "exerciseId");
  await submitAssignment(me, exerciseId, content);
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
