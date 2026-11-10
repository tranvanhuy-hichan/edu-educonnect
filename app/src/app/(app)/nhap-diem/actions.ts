"use server";
import { revalidatePath } from "next/cache";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { saveClassScores } from "@/modules/scoring/gradebook.service";
import { lockGradebook } from "@/modules/scoring/unlock.service";
export const saveScores = wrap(async (fd) => {
  const me = await assertRole(...TEACHING_ROLES, ...MANAGER_ROLES);
  const result = await saveClassScores(me, { assignmentId: str(fd, "assignmentId"), reason: str(fd, "reason"), rows: JSON.parse(str(fd, "rows")) });
  revalidatePath("/nhap-diem"); revalidatePath(`/nhap-diem/${result.assignmentId}`);
  return `Đã lưu điểm (${result.changed} học sinh thay đổi)`;
});
export const toggleLockTerm = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  if (fd.get("lock") !== "true") throw new Error("Không mở khóa toàn bộ học kỳ. Hãy yêu cầu mở quyền sửa có thời hạn tại bảng điểm lớp-môn.");
  const term = await lockGradebook(me, str(fd, "termId"));
  revalidatePath("/nhap-diem");
  return `Đã khóa sổ điểm ${term.termName}`;
});
