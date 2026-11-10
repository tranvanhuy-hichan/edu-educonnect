"use server";
import { revalidatePath } from "next/cache";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { saveStudentAssessment } from "@/modules/scoring/assessment.service";
export const saveAssessment = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const result = await saveStudentAssessment(me, { assignmentId: str(fd, "assignmentId"), studentId: str(fd, "studentId"), outcome: str(fd, "outcome"), isExempt: fd.get("isExempt") === "on", comment: str(fd, "comment"), adjustmentReason: str(fd, "adjustmentReason"), decisionReference: str(fd, "decisionReference"), reason: str(fd, "reason") });
  revalidatePath(`/nhap-diem/${result.assignmentId}`); revalidatePath("/len-lop"); revalidatePath("/phu-huynh");
  return "Đã lưu đánh giá";
});
