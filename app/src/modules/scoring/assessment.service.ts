import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { withTransaction } from "@/infrastructure/database/unit-of-work";
import * as records from "@/modules/academic/records.repository";
import { yearResultRepository } from "@/modules/promotion/promotion.repository";
import { gradingRepository } from "./scoring.repository";
import { assertScoreWrite } from "./locking";
export type AssessmentInput = { assignmentId: string; studentId: string; outcome: string; isExempt: boolean; comment: string; adjustmentReason: string; decisionReference: string; reason: string };
export async function saveStudentAssessment(me: SessionUser, input: AssessmentInput) {
  const { assignmentId, studentId } = input;
  if (!await canManageClassSubjectAssignment(me, assignmentId)) throw new Error("Không phụ trách lớp-môn này");
  const outcome = input.outcome;
  if (outcome && !["DAT", "CHUA_DAT"].includes(outcome)) throw new Error("Kết quả nhận xét không hợp lệ");
  const isExempt = input.isExempt, comment = input.comment, adjustmentReason = input.adjustmentReason, decisionReference = input.decisionReference;
  const reason = input.reason;
  if (reason.length < 5) throw new Error("Nhập lý do cập nhật ít nhất 5 ký tự");
  if ((isExempt || adjustmentReason) && (!isAdmin(me) || decisionReference.length < 3)) throw new Error("Miễn/điều chỉnh cần quản lý xác nhận và số quyết định/căn cứ");
  if (isExempt && outcome) throw new Error("Học sinh miễn đánh giá không có kết quả Đạt/Chưa đạt");
  await withTransaction(async (tx) => {
    const assignment = await assertScoreWrite(me, assignmentId, tx);
    const enrollment = await records.findEnrollment(studentId, assignment.academicTerm.academicYearId, tx);
    if (!enrollment || enrollment.schoolClassId !== assignment.schoolClassId) throw new Error("Học sinh không thuộc lớp này");
    await records.lockEnrollment(enrollment.id, tx);
    if ((await yearResultRepository(tx).find(studentId, enrollment.academicYearId))?.reviewStatus === "APPROVED") throw new Error("Hồ sơ cuối năm đã duyệt; cần mở lại trước khi sửa");
    const before = await gradingRepository(tx).assessment(studentId, assignmentId);
    if (!isAdmin(me) && (before?.isExempt || before?.adjustmentReason || before?.decisionReference)) throw new Error("Quyết định miễn/điều chỉnh chỉ được quản lý sửa");
    if (assignment.subject.assessmentType !== "COMMENT" && outcome) throw new Error("Môn tính điểm không dùng kết quả nhận xét thay điểm số");
    const data = { outcome: outcome as "DAT" | "CHUA_DAT" || null, isExempt, comment: comment || null, adjustmentReason: adjustmentReason || null, decisionReference: decisionReference || null, updatedBy: me.email };
    const after = await gradingRepository(tx).saveAssessment(studentId, assignmentId, data);
    await records.appendAudit({ actorEmail: me.email, action: "save_assessment", targetType: "StudentAssessment", targetId: after.id, reason, beforeData: JSON.parse(JSON.stringify(before)), afterData: JSON.parse(JSON.stringify(after)) }, tx);
  });
  return { assignmentId };
}
