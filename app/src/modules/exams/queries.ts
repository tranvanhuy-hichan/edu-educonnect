import type { DatabaseContext } from "@/infrastructure/database/unit-of-work";
import { findVisibleEvent, examCatalog } from "./exams-read.repository";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { examStaff, examVisibility } from "./service";
import { getPolicy } from "@/lib/policy";

export const EXAM_STATUS = { DRAFT: "Bản nháp", PUBLISHED: "Đã công bố", CANCELLED: "Đã hủy" };
export function examIncludes(user: SessionUser) {
  const own = examStaff(user) ? {} : { studentId: user.studentId ?? "__no_access__" };
  const scope = examStaff(user) ? {} : { seats: { some: own } };
  return {
    gradeLevel: true, academicTerm: { include: { academicYear: true } },
    papers: { where: scope, orderBy: { startsAt: "asc" as const }, include: { subject: true, rooms: { where: scope, orderBy: { label: "asc" as const }, include: { room: true, invigilators: { orderBy: { position: "asc" as const }, include: { teacher: { select: { id: true, fullName: true } } } }, seats: { where: own, orderBy: { seatNo: "asc" as const } } } } } },
  } satisfies Prisma.ExamEventInclude;
}
export function getExamEvent(user: SessionUser, id: string, client?: DatabaseContext) { return findVisibleEvent(id, examVisibility(user), examStaff(user), user.studentId ?? "__no_access__", client); }
export async function examFormData() {
  const { terms, grades, subjects, rooms, teachers, offerings } = await examCatalog();
  const categories = (await getPolicy()).examCategories;
  return { categories, offerings: offerings.flatMap((row) => row.schoolClass.academicYear.terms.map((term) => ({ termId: term.id, gradeId: row.schoolClass.gradeLevelId, subjectId: row.subjectId, count: row.schoolClass._count.enrollments }))), terms: terms.map((term) => ({ id: term.id, current: term.startDate <= new Date() && term.endDate >= new Date(), label: `${term.termName} · ${term.academicYear.yearName}` })), grades: grades.map((grade) => ({ id: grade.id, label: grade.gradeName })), subjects: subjects.map((subject) => ({ id: subject.id, label: subject.subjectName })), rooms: rooms.map((room) => ({ id: room.id, label: room.roomName, capacity: room.capacity })), teachers: teachers.map((teacher) => ({ id: teacher.id, label: `${teacher.fullName}${teacher.code ? ` (${teacher.code})` : ""}` })) };
}
export type ExamFormData = Awaited<ReturnType<typeof examFormData>>;

/** Cards need room counts and the viewer's seat/duty, never the full exam roster. */
export function examListSelect(user: SessionUser) {
  const staff = examStaff(user);
  const own = { studentId: user.studentId ?? "__no_access__" };
  const scope = staff ? {} : { seats: { some: own } };
  return {
    id: true, title: true, status: true, category: true,
    gradeLevel: { select: { gradeName: true } },
    academicTerm: { select: { termName: true, academicYear: { select: { yearName: true } } } },
    papers: { where: scope, orderBy: { startsAt: "asc" }, select: {
      id: true, startsAt: true, endsAt: true, grouping: true, subject: { select: { subjectName: true } },
      _count: { select: { rooms: { where: scope } } },
      rooms: { where: staff ? { invigilators: { some: { teacherId: user.teacherId ?? "__no_access__" } } } : scope, select: {
        room: { select: { roomName: true } },
        invigilators: { where: { teacherId: user.teacherId ?? "__no_access__" }, select: { teacherId: true } },
        seats: { where: staff ? { id: "__no_access__" } : own, select: { registrationNo: true, seatNo: true } },
      } },
    } },
  } satisfies Prisma.ExamEventSelect;
}
