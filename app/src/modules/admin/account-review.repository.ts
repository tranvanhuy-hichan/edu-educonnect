import { prisma } from "@/lib/prisma";

export const currentYear = (now: Date) => prisma.academicYear.findFirst({ where: { startDate: { lte: now } }, orderBy: { startDate: "desc" } });
export const firstTrackedLogin = async () => (await prisma.user.aggregate({ _min: { lastLoginAt: true } }))._min.lastLoginAt;

const select = { id: true, email: true, roles: true, lastLoginAt: true, createdAt: true, lockedUntil: true, teacher: { select: { fullName: true } }, student: { select: { fullName: true } } } as const;
const staff = { isActive: true, NOT: { roles: { has: "STUDENT" as const } } };

export const usersNotSeenSince = (cutoff: Date, exceptId: string) => prisma.user.findMany({ where: { ...staff, id: { not: exceptId }, lastLoginAt: { lt: cutoff } }, orderBy: { lastLoginAt: "asc" }, take: 200, select });
export const staffNeverLoggedIn = (createdBefore: Date, exceptId: string) => prisma.user.findMany({ where: { ...staff, id: { not: exceptId }, lastLoginAt: null, createdAt: { lt: createdBefore } }, orderBy: { createdAt: "asc" }, take: 200, select });
export const lockedNow = (now: Date) => prisma.user.findMany({ where: { lockedUntil: { gt: now } }, take: 100, select });

/** Giáo viên đang hoạt động không có phân công nào và không chủ nhiệm lớp nào trong năm học hiện hành. */
export async function idleTeachers(yearId: string, exceptId: string) {
  const [assigned, homeroom] = await Promise.all([
    prisma.classSubjectAssignment.findMany({ where: { academicTerm: { academicYearId: yearId } }, select: { teacherId: true }, distinct: ["teacherId"] }),
    prisma.schoolClass.findMany({ where: { academicYearId: yearId, homeroomTeacherId: { not: null } }, select: { homeroomTeacherId: true }, distinct: ["homeroomTeacherId"] }),
  ]);
  const busy = new Set([...assigned.map((a) => a.teacherId), ...homeroom.map((c) => c.homeroomTeacherId as string)]);
  return prisma.user.findMany({ where: { isActive: true, id: { not: exceptId }, teacher: { is: { id: { notIn: [...busy] } } } }, take: 200, orderBy: { createdAt: "asc" }, select });
}
/** Học sinh đang hoạt động nhưng không còn xếp lớp nào trong năm học hiện hành (đã ra trường/thôi học?). */
export const studentsWithoutClass = (yearId: string) => prisma.user.findMany({ where: { isActive: true, student: { is: { enrollments: { none: { academicYearId: yearId } } } } }, take: 200, orderBy: { createdAt: "asc" }, select });
export const adminUserIds = async () => (await prisma.user.findMany({ where: { isActive: true, roles: { has: "ADMIN" } }, select: { id: true } })).map((u) => u.id);
