import { withTransaction } from "@/infrastructure/database/unit-of-work";
import * as repository from "./records.repository";
import { yearResultRepository } from "@/modules/promotion/promotion.repository";
import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { getPolicy } from "@/lib/policy";
import { todayUTC } from "@/lib/format";

export async function moveStudent(user: SessionUser, input: { studentId: string; targetClassId: string; effectiveDate: string; reason: string; decisionReference: string }) {
  if (!isAdmin(user)) throw new Error("Chỉ quản lý được chuyển lớp");
  if (input.reason.trim().length < 5 || input.decisionReference.trim().length < 3) throw new Error("Nhập lý do và số quyết định/căn cứ xếp lớp");
  const effectiveAt = new Date(`${input.effectiveDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate) || Number.isNaN(effectiveAt.getTime()) || effectiveAt.toISOString().slice(0, 10) !== input.effectiveDate || effectiveAt > todayUTC()) throw new Error("Ngày hiệu lực không hợp lệ hoặc ở tương lai");
  return withTransaction(async (tx) => {
    // Khóa học sinh trước, sau đó khóa các lớp theo thứ tự cố định để tránh mất lịch sử/sĩ số.
    await repository.lockStudent(input.studentId, tx);
    const target = await repository.findClass(input.targetClassId, tx);
    const existing = await repository.findEnrollment(input.studentId, target.academicYearId, tx);
    const classIds = [...new Set([target.id, ...(existing ? [existing.schoolClassId] : [])])].sort();
    for (const classId of classIds) await repository.lockClass(classId, tx);
    if (existing) await repository.lockEnrollment(existing.id, tx);
    if (effectiveAt < target.academicYear.startDate || effectiveAt > target.academicYear.endDate) throw new Error("Ngày hiệu lực nằm ngoài năm học");
    if (existing?.schoolClassId === target.id) throw new Error("Học sinh đang ở lớp này");
    if (existing?.currentClassSince && input.effectiveDate < existing.currentClassSince.toISOString().slice(0, 10)) throw new Error("Ngày chuyển phải sau ngày bắt đầu học lớp hiện tại");
    if ((await yearResultRepository(tx).find(input.studentId, target.academicYearId))?.reviewStatus === "APPROVED") throw new Error("Kết quả năm học đã duyệt. Cần mở lại trước khi đổi lớp");
    if (await repository.countClassEnrollments(target.id, tx) >= (await getPolicy()).promotion.classCapacity) throw new Error("Lớp đích đã đủ sĩ số");
    if (existing) {
      const source = await repository.findClass(existing.schoolClassId, tx);
      await repository.appendTransfer({ studentId: input.studentId, academicYearId: target.academicYearId, fromClassId: source.id, toClassId: target.id, fromDate: existing.currentClassSince, effectiveAt, reason: input.reason, decisionReference: input.decisionReference, actorEmail: user.email }, tx);
      await repository.clearClassMonitor(source.id, input.studentId, tx);
    }
    const result = await repository.saveEnrollment(input.studentId, target.academicYearId, target.id, effectiveAt, tx);
    await repository.appendAudit({ actorEmail: user.email, action: existing ? "transfer_student" : "enroll_student", targetType: "StudentClassEnrollment", targetId: result.id, reason: `${input.reason} · ${input.decisionReference}`, beforeData: JSON.parse(JSON.stringify(existing)), afterData: JSON.parse(JSON.stringify(result)) }, tx);
    return result;
  });
}
