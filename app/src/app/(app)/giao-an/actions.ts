"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { createLessonPlan } from "@/modules/content/content.service";

const TEACH = [...MANAGER_ROLES, ...TEACHING_ROLES];

function link(raw: string | null) {
  if (raw && !/^https?:\/\//.test(raw)) throw new Error("Đường dẫn đính kèm phải bắt đầu bằng http/https");
  return raw ?? undefined;
}

export const createPlan = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || !content) throw new Error("Nhập tiêu đề và nội dung giáo án");
  const plan = await createLessonPlan(me, { assignmentId: str(fd, "assignmentId"), title, content, attachment: link(opt(fd, "attachment")) });
  await audit(me.email, "create_lesson_plan", "LessonPlan", plan.id);
  revalidatePath("/giao-an");
  revalidatePath("/lop-cua-toi", "layout");
});

export const updatePlan = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const plan = await db.lessonPlan.findUniqueOrThrow({ where: { id: str(fd, "id") } });
  if (!(await canManageClassSubjectAssignment(me, plan.assignmentId))) throw new Error("Bạn không phụ trách lớp-môn này");
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || !content) throw new Error("Nhập tiêu đề và nội dung giáo án");
  await db.lessonPlan.update({ where: { id: plan.id }, data: { title, content, attachment: link(opt(fd, "attachment")) ?? null } });
  revalidatePath("/giao-an");
});

export const deletePlan = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const plan = await db.lessonPlan.findUniqueOrThrow({ where: { id: str(fd, "id") } });
  if (!(await canManageClassSubjectAssignment(me, plan.assignmentId))) throw new Error("Bạn không phụ trách lớp-môn này");
  await db.lessonPlan.delete({ where: { id: plan.id } });
  await audit(me.email, "delete_lesson_plan", "LessonPlan", plan.id);
  revalidatePath("/giao-an");
  revalidatePath("/lop-cua-toi", "layout");
});
