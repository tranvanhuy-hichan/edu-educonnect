import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { examStaff, examVisibility } from "./service";

export const EXAM_STATUS = { DRAFT: "Bản nháp", PUBLISHED: "Đã công bố", CANCELLED: "Đã hủy" };
export const EXAM_CATEGORY = { GIUA_KY: "Giữa kỳ", CUOI_KY: "Cuối kỳ", THI_LAI: "Thi lại", KHAC: "Khác" };
export function examIncludes(user: SessionUser) {
  const own = examStaff(user) ? {} : { studentId: user.studentId ?? "__no_access__" };
  const scope = examStaff(user) ? {} : { seats: { some: own } };
  return {
    gradeLevel: true, academicTerm: { include: { academicYear: true } },
    papers: { where: scope, orderBy: { startsAt: "asc" as const }, include: { subject: true, rooms: { where: scope, orderBy: { label: "asc" as const }, include: { room: true, invigilators: { orderBy: { position: "asc" as const }, include: { teacher: { select: { id: true, fullName: true } } } }, seats: { where: own, orderBy: { seatNo: "asc" as const } } } } } },
  } satisfies Prisma.ExamEventInclude;
}
export function getExamEvent(user: SessionUser, id: string, client: Pick<Prisma.TransactionClient, "examEvent"> = prisma) { return client.examEvent.findFirst({ where: { id, ...examVisibility(user) }, include: examIncludes(user) }); }
export async function examFormData() {
  const [terms, grades, subjects, rooms, teachers, offerings] = await Promise.all([
    prisma.academicTerm.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    prisma.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.subject.findMany({ orderBy: { subjectName: "asc" } }),
    prisma.room.findMany({ orderBy: { roomName: "asc" } }),
    prisma.teacher.findMany({ where: { user: { isActive: true } }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }),
    prisma.classSubject.findMany({ select: { subjectId: true, schoolClass: { select: { academicYear: { select: { terms: { select: { id: true } } } }, gradeLevelId: true, _count: { select: { enrollments: { where: { student: { user: { isActive: true } } } } } } } } } }),
  ]);
  return { offerings: offerings.flatMap((row) => row.schoolClass.academicYear.terms.map((term) => ({ termId: term.id, gradeId: row.schoolClass.gradeLevelId, subjectId: row.subjectId, count: row.schoolClass._count.enrollments }))), terms: terms.map((term) => ({ id: term.id, current: term.startDate <= new Date() && term.endDate >= new Date(), label: `${term.termName} · ${term.academicYear.yearName}` })), grades: grades.map((grade) => ({ id: grade.id, label: grade.gradeName })), subjects: subjects.map((subject) => ({ id: subject.id, label: subject.subjectName })), rooms: rooms.map((room) => ({ id: room.id, label: room.roomName, capacity: room.capacity })), teachers: teachers.map((teacher) => ({ id: teacher.id, label: `${teacher.fullName}${teacher.code ? ` (${teacher.code})` : ""}` })) };
}
export type ExamFormData = Awaited<ReturnType<typeof examFormData>>;
