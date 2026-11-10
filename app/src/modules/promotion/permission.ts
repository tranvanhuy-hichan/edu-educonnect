import type { DatabaseContext } from "@/infrastructure/database/unit-of-work";
import { findEnrollment } from "@/modules/academic/records.repository";
import { isAdmin, type SessionUser } from "@/lib/auth/session";

export async function requireYearStudentWriter(user: SessionUser, studentId: string, academicYearId: string, context?: DatabaseContext) {
  const enrollment = await findEnrollment(studentId, academicYearId, context);
  if (!enrollment) throw new Error("Học sinh không thuộc năm học đã chọn");
  if (!isAdmin(user) && !(user.roles.includes("HOMEROOM_TEACHER") && user.teacherId && enrollment.schoolClass.homeroomTeacherId === user.teacherId)) throw new Error("Bạn không chủ nhiệm học sinh này trong năm học đã chọn");
  return enrollment;
}
