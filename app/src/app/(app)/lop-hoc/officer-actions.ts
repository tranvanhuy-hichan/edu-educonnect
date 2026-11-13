"use server";
import { runSharedCommand } from "@/lib/shared-command";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ensureTeacherRole } from "@/server/accounts";
import { canManageSchoolClass } from "@/lib/auth/permission";

/** Chỉ ADMIN đổi GVCN của lớp. */
export const setHomeroomTeacher = wrap(async (fd) => {
  const me = await assertRole("ADMIN");
  const classId = str(fd, "classId");
  const teacherId = str(fd, "teacherId") || null;
  await db.schoolClass.findUniqueOrThrow({ where: { id: classId }, select: { id: true } });
  if (teacherId) await db.teacher.findUniqueOrThrow({ where: { id: teacherId }, select: { id: true } });
  await db.schoolClass.update({ where: { id: classId }, data: { homeroomTeacherId: teacherId } });
  if (teacherId) await ensureTeacherRole(teacherId, "HOMEROOM_TEACHER");
  await audit(me.email, "set_homeroom_teacher", "SchoolClass", classId);
  revalidatePath(`/lop-hoc/${classId}`); revalidatePath("/lop-hoc");
  return teacherId ? "Đã phân công giáo viên chủ nhiệm" : "Đã bỏ giáo viên chủ nhiệm";
});

/** Ban cán sự: ADMIN hoặc GVCN của chính lớp đó. */
export const setClassOfficer = wrap(async (fd) => {
  const me = await assertRole("ADMIN", "HOMEROOM_TEACHER");
  const classId = str(fd, "classId");
  if (!(await canManageSchoolClass(me, classId))) throw new Error("Chỉ giáo viên chủ nhiệm của lớp này được quản lý ban cán sự");
  const office = str(fd, "office");
  if (!["SECRETARY", "RED_MONITOR", "PRESIDENT"].includes(office)) throw new Error("Chức danh không hợp lệ");
  const cls = await db.schoolClass.findUniqueOrThrow({ where: { id: classId }, include: { academicYear: true } });
  const [{ y }] = await db.$queryRaw<{ y: number }[]>`SELECT edu.cur_school_year() AS y`;
  if (!cls.departmentId || cls.academicYear.schoolYear !== y) throw new Error("Chỉ sửa chức danh của lớp đã liên kết trong năm học hiện hành");
  const remove = str(fd, "remove") === "1";
  const mid = str(fd, "memberId") || (str(fd, "accountId") ? (await db.doanMember.findUnique({ where: { userId: str(fd, "accountId") }, select: { id: true } }))?.id : null) || null;
  if ((!remove || office === "RED_MONITOR") && !mid) throw new Error("Chọn học sinh hợp lệ");
  await runSharedCommand(() => db.$queryRaw`SELECT 1 FROM edu.assign_class_officer('edu', ${me.id}, ${cls.departmentId}, ${office}, ${mid}, ${remove})`);
  revalidatePath(`/lop-hoc/${classId}`); revalidatePath("/lop-hoc");
  return "Đã cập nhật ban cán sự dùng chung";
});

/** Lớp phó học tập (nhiều người): ADMIN hoặc GVCN của lớp. Chỉ lưu ở EduConnect. */
export const setAcademicDeputy = wrap(async (fd) => {
  const me = await assertRole("ADMIN", "HOMEROOM_TEACHER");
  const classId = str(fd, "classId");
  const studentId = str(fd, "studentId");
  if (!(await canManageSchoolClass(me, classId))) throw new Error("Chỉ giáo viên chủ nhiệm của lớp này được quản lý ban cán sự");
  if (!studentId) throw new Error("Chọn học sinh hợp lệ");
  if (str(fd, "remove") === "1") {
    await db.classAcademicDeputy.deleteMany({ where: { schoolClassId: classId, studentId } });
    await audit(me.email, "unset_academic_deputy", "SchoolClass", classId);
    revalidatePath(`/lop-hoc/${classId}`);
    return "Đã gỡ lớp phó học tập";
  }
  if (!(await db.studentClassEnrollment.findFirst({ where: { schoolClassId: classId, studentId }, select: { id: true } }))) throw new Error("Học sinh này không thuộc lớp");
  await db.classAcademicDeputy.upsert({ where: { schoolClassId_studentId: { schoolClassId: classId, studentId } }, create: { schoolClassId: classId, studentId }, update: {} });
  await audit(me.email, "set_academic_deputy", "SchoolClass", classId);
  revalidatePath(`/lop-hoc/${classId}`);
  return "Đã thêm lớp phó học tập";
});
