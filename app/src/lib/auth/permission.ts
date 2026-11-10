import { prisma } from "@/lib/prisma";
import { isAdmin, type SessionUser } from "@/lib/auth/session";

/** Hiệu trưởng/Hiệu phó xem được mọi lớp; GVCN chỉ xem được lớp mình chủ nhiệm. */
export async function canManageSchoolClass(
  user: SessionUser,
  schoolClassId: string,
): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (!user.teacherId) return false;

  const schoolClass = await prisma.schoolClass.findUnique({
    where: { id: schoolClassId },
    select: { homeroomTeacherId: true },
  });

  return schoolClass?.homeroomTeacherId === user.teacherId;
}

/** GVBM chỉ thao tác được assignment (lớp-môn-kỳ) mình được phân công. */
export async function canManageClassSubjectAssignment(
  user: SessionUser,
  assignmentId: string,
): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (!user.teacherId) return false;

  const assignment = await prisma.classSubjectAssignment.findUnique({
    where: { id: assignmentId },
    select: { teacherId: true },
  });

  return assignment?.teacherId === user.teacherId;
}

/** Hiệu trưởng/Hiệu phó/GVCN xem được; GVBM cũng xem được danh sách học sinh của lớp mình DẠY (không chỉ lớp mình chủ nhiệm). */
export async function canViewSchoolClassRoster(
  user: SessionUser,
  schoolClassId: string,
): Promise<boolean> {
  const allowedAsHomeroom = await canManageSchoolClass(user, schoolClassId);
  if (allowedAsHomeroom) return true;
  if (!user.teacherId) return false;

  const assignment = await prisma.classSubjectAssignment.findFirst({
    where: { schoolClassId, teacherId: user.teacherId },
    select: { id: true },
  });

  return assignment !== null;
}

/**
 * Hiệu trưởng/Hiệu phó xem mọi học sinh; GVCN xem học sinh lớp mình chủ nhiệm
 * (theo StudentClassEnrollment của năm học hiện tại); học sinh chỉ xem chính mình.
 */
export async function canViewStudent(
  user: SessionUser,
  studentId: string,
): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (user.studentId === studentId) return true;

  if (user.teacherId) {
    const enrollment = await prisma.studentClassEnrollment.findFirst({
      where: {
        studentId,
        schoolClass: { homeroomTeacherId: user.teacherId },
      },
      select: { id: true },
    });
    if (enrollment) return true;
  }

  return false;
}
