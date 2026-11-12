import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const currentYear = () => prisma.academicYear.findFirst({ where: { startDate: { lte: new Date() } }, orderBy: { startDate: "desc" } });
export const listYears = () => prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
export const findYear = (idOrName: string) => prisma.academicYear.findFirst({ where: { OR: [{ id: idOrName }, { yearName: idOrName }] } });

export const gradesWithCounts = async (yearId: string) => {
  const [grades, classes] = await Promise.all([
    prisma.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.schoolClass.findMany({ where: { academicYearId: yearId }, select: { gradeLevelId: true, _count: { select: { enrollments: true } } } }),
  ]);
  return grades.map((g) => {
    const own = classes.filter((c) => c.gradeLevelId === g.id);
    return { ...g, classCount: own.length, studentCount: own.reduce((n, c) => n + c._count.enrollments, 0) };
  });
};

const classInclude = { gradeLevel: true, academicYear: true, homeroomTeacher: { select: { id: true, code: true, fullName: true } }, _count: { select: { enrollments: true } } } satisfies Prisma.SchoolClassInclude;
export const listClasses = (where: Prisma.SchoolClassWhereInput, skip: number, take: number) =>
  Promise.all([prisma.schoolClass.count({ where }), prisma.schoolClass.findMany({ where, include: classInclude, orderBy: [{ gradeLevel: { sortOrder: "asc" } }, { className: "asc" }, { id: "asc" }], skip, take })]);
export const findClass = (id: string) => prisma.schoolClass.findUnique({ where: { id }, include: classInclude });

const enrollmentInclude = {
  student: { include: { user: { select: { isActive: true, email: true } }, youth: true } },
  schoolClass: { include: { gradeLevel: true, academicYear: true } },
} satisfies Prisma.StudentClassEnrollmentInclude;
export const listEnrollments = (where: Prisma.StudentClassEnrollmentWhereInput, skip: number, take: number) =>
  Promise.all([
    prisma.studentClassEnrollment.count({ where }),
    prisma.studentClassEnrollment.findMany({ where, include: enrollmentInclude, orderBy: [{ schoolClass: { gradeLevel: { sortOrder: "asc" } } }, { schoolClass: { className: "asc" } }, { student: { fullName: "asc" } }, { id: "asc" }], skip, take }),
  ]);
export const findStudentEnrollment = (studentId: string, yearId: string) => prisma.studentClassEnrollment.findFirst({ where: { studentId, academicYearId: yearId }, include: enrollmentInclude });
export const findStudentOnly = (id: string) => prisma.student.findUnique({ where: { id }, include: { user: { select: { isActive: true, email: true } }, youth: true } });
export const listRooms = () => prisma.room.findMany({ orderBy: { roomName: "asc" } });
export const listSubjects = () => prisma.subject.findMany({ orderBy: { subjectName: "asc" } });

const teacherInclude = (yearId: string) => ({
  user: { select: { isActive: true, email: true } },
  subjects: { include: { subject: { select: { id: true, subjectName: true } } } },
  homeroomClasses: { where: { academicYearId: yearId }, select: { id: true, className: true } },
}) satisfies Prisma.TeacherInclude;
export const listTeachers = (where: Prisma.TeacherWhereInput, yearId: string, skip: number, take: number) =>
  Promise.all([prisma.teacher.count({ where }), prisma.teacher.findMany({ where, include: teacherInclude(yearId), orderBy: [{ fullName: "asc" }, { id: "asc" }], skip, take })]);
export const findTeacher = (id: string, yearId: string) => prisma.teacher.findUnique({ where: { id }, include: teacherInclude(yearId) });

export const findYouth = (studentId: string) => prisma.student.findUnique({ where: { id: studentId }, select: { id: true, youth: true } });
export const listYouth = (skip: number, take: number) => Promise.all([prisma.studentYouth.count(), prisma.studentYouth.findMany({ orderBy: [{ updatedAt: "desc" }, { studentId: "asc" }], skip, take })]);
