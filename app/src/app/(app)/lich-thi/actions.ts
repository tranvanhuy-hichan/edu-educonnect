"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertRole, MANAGER_ROLES } from "@/lib/guard";
import { str, wrap } from "@/lib/action";
import { parseExamPlan } from "@/modules/exams/schema";
import { prepareExamPlan, saveExamPlan, transitionExam, reviewExamPlan, suggestExamResources } from "@/modules/exams/service";

export const previewExams = wrap(async (fd) => {
  const user = await assertRole(...MANAGER_ROLES);
  const preview = await prepareExamPlan(user, parseExamPlan(str(fd, "plan")));
  return { ok: "Đã chia danh sách", data: { preview: JSON.stringify(preview) } };
});
export const saveExams = wrap(async (fd) => {
  const user = await assertRole(...MANAGER_ROLES);
  const event = await saveExamPlan(user, parseExamPlan(str(fd, "plan")), str(fd, "fingerprint"), str(fd, "id") || undefined);
  revalidatePath("/lich-thi");
  revalidatePath(`/lich-thi/${event.id}`);
  redirect(`/lich-thi/${event.id}`);
});
export const changeExamStatus = wrap(async (fd) => {
  const user = await assertRole(...MANAGER_ROLES);
  const operation = str(fd, "operation");
  if (operation !== "publish" && operation !== "withdraw" && operation !== "cancel") throw new Error("Thao tác không hợp lệ");
  await transitionExam(user, str(fd, "id"), operation);
  revalidatePath("/lich-thi");
  revalidatePath(`/lich-thi/${str(fd, "id")}`);
  return operation === "publish" ? "Đã công bố lịch thi" : operation === "withdraw" ? "Đã thu hồi về bản nháp" : "Đã hủy lịch thi";
});

export const checkExams = wrap(async (fd) => {
  const user = await assertRole(...MANAGER_ROLES);
  await reviewExamPlan(user, parseExamPlan(str(fd, "plan")), str(fd, "fingerprint"), str(fd, "id") || undefined);
  return "Hợp lệ: đủ phòng và giám thị, không trùng phòng/giám thị/học sinh (kể cả giờ có mặt).";
});
export const suggestExams = wrap(async (fd) => {
  const user = await assertRole(...MANAGER_ROLES);
  const plan = await suggestExamResources(user, parseExamPlan(str(fd, "plan")), str(fd, "fingerprint"), Number(str(fd, "proctors") || 1), str(fd, "id") || undefined);
  return { ok: "Đã gợi ý phòng và giám thị. Bạn có thể điều chỉnh trước khi lưu.", data: { plan: JSON.stringify(plan) } };
});
