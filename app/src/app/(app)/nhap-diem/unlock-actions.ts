"use server";
import { revalidatePath } from "next/cache";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { requestScoreUnlock, reviewScoreUnlock } from "@/modules/scoring/unlock.service";
export const requestUnlock = wrap(async (fd) => {
  const user = await assertRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const result = await requestScoreUnlock(user, { assignmentId: str(fd, "assignmentId"), reason: str(fd, "reason"), durationHours: Number(str(fd, "durationHours")) });
  revalidatePath(`/nhap-diem/${result.assignmentId}`);
  return "Đã gửi yêu cầu mở quyền sửa";
});
export const reviewUnlock = wrap(async (fd) => {
  const user = await assertRole(...MANAGER_ROLES);
  const result = await reviewScoreUnlock(user, { requestId: str(fd, "requestId"), reason: str(fd, "reason"), approve: str(fd, "approve") === "true" });
  revalidatePath(`/nhap-diem/${result.assignmentId}`);
  return "Đã xử lý yêu cầu";
});
