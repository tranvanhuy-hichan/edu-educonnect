import type { Prisma } from "@prisma/client";
import { databaseFor, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
import { prisma } from "@/lib/prisma";
export function findVisibleEvent(id: string, visibility: Prisma.ExamEventWhereInput, staff: boolean, studentId: string, context?: DatabaseContext) {
  const own = staff ? {} : { studentId };
  const scope = staff ? {} : { seats: { some: own } };
  return databaseFor(context).examEvent.findFirst({ where: { id, ...visibility }, include: { gradeLevel: true, academicTerm: { include: { academicYear: true } }, papers: { where: scope, orderBy: { startsAt: "asc" }, include: { subject: true, rooms: { where: scope, orderBy: { label: "asc" }, include: { room: true, invigilators: { orderBy: { position: "asc" }, include: { teacher: { select: { id: true, fullName: true } } } }, seats: { where: own, orderBy: { seatNo: "asc" } } } } } } } });
}
export async function examCatalog() {
  const [terms, grades, subjects, rooms, teachers, offerings] = await Promise.all([
    prisma.academicTerm.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    prisma.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.subject.findMany({ orderBy: { subjectName: "asc" } }),
    prisma.room.findMany({ orderBy: { roomName: "asc" } }),
    prisma.teacher.findMany({ where: { user: { isActive: true } }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }),
    prisma.classSubject.findMany({ select: { subjectId: true, schoolClass: { select: { academicYear: { select: { terms: { select: { id: true } } } }, gradeLevelId: true, _count: { select: { enrollments: { where: { student: { user: { isActive: true } } } } } } } } } }),
  ]);
  return { terms, grades, subjects, rooms, teachers, offerings };
}
