"use server";
import { revalidatePath } from "next/cache";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { createLessonPlan, updateLessonPlan, deleteLessonPlan } from "@/modules/content/content.service";

import { validAttachment } from "@/lib/storage/validation";

const TEACH = [...MANAGER_ROLES, ...TEACHING_ROLES];

function link(raw: string | null) {
  if (raw && !validAttachment(raw)) throw new Error("Tệp hoặc đường dẫn đính kèm không hợp lệ");
  return raw ?? undefined;
}

export const createPlan = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || (!content && !str(fd, "attachment"))) throw new Error("Nhập tiêu đề và nội dung giáo án");
  const plan = await createLessonPlan(me, { assignmentId: str(fd, "assignmentId"), title, content, attachment: link(opt(fd, "attachment")) });
  await audit(me.email, "create_lesson_plan", "LessonPlan", plan.id);
  revalidatePath("/giao-an");
  revalidatePath("/lop-cua-toi", "layout");
});

export const updatePlan = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const title = str(fd, "title"), content = str(fd, "content");
  if (!title || (!content && !str(fd, "attachment"))) throw new Error("Nhập tiêu đề và nội dung giáo án");
  const attachment = link(opt(fd, "attachment"));
  await updateLessonPlan(me, str(fd, "id"), { title, content, attachment });
  revalidatePath("/giao-an");
});

export const deletePlan = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const plan = await deleteLessonPlan(me, str(fd, "id"));
  await audit(me.email, "delete_lesson_plan", "LessonPlan", plan.id);
  revalidatePath("/giao-an");
  revalidatePath("/lop-cua-toi", "layout");
});
