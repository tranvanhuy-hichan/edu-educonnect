import { prisma } from "@/lib/prisma";

const ci = (v: string) => ({ contains: v, mode: "insensitive" as const });

export const findStudents = (q: string, take: number) => prisma.student.findMany({
  where: { OR: [{ fullName: ci(q) }, { code: ci(q) }, { user: { email: ci(q) } }] }, orderBy: { fullName: "asc" }, take,
  select: { id: true, fullName: true, code: true, enrollments: { take: 1, orderBy: { academicYear: { startDate: "desc" } }, select: { schoolClass: { select: { className: true } } } } },
});
export const findTeachers = (q: string, take: number) => prisma.teacher.findMany({
  where: { OR: [{ fullName: ci(q) }, { code: ci(q) }, { user: { email: ci(q) } }] }, orderBy: { fullName: "asc" }, take,
  select: { id: true, fullName: true, code: true },
});
export const findClasses = (q: string, take: number) => prisma.schoolClass.findMany({
  where: { className: ci(q), academicYear: { endDate: { gte: new Date() } } }, orderBy: { className: "asc" }, take,
  select: { id: true, className: true, gradeLevel: { select: { gradeName: true } } },
});
export const findAccounts = (q: string, take: number) => prisma.user.findMany({
  where: { OR: [{ email: ci(q) }, { teacher: { fullName: ci(q) } }, { student: { fullName: ci(q) } }] }, orderBy: { email: "asc" }, take,
  select: { id: true, email: true, isActive: true, teacher: { select: { fullName: true } }, student: { select: { fullName: true } } },
});
