import { effectiveSlots } from "./effective";
import { prisma } from "@/lib/prisma";
import type { CreateTimetableSlotInput } from "@/modules/scheduling/scheduling.schema";

export function findSlotByRoomSlot(
  roomId: string,
  versionId: string,
  dayOfWeek: number,
  periodNo: number,
) {
  return prisma.timetableSlot.findUnique({
    where: {
      roomId_versionId_dayOfWeek_periodNo: {
        roomId,
        versionId,
        dayOfWeek,
        periodNo,
      },
    },
  });
}

export function findSlotByAssignmentSlot(
  assignmentId: string,
  versionId: string,
  dayOfWeek: number,
  periodNo: number,
) {
  return prisma.timetableSlot.findUnique({
    where: {
      assignmentId_versionId_dayOfWeek_periodNo: {
        assignmentId,
        versionId,
        dayOfWeek,
        periodNo,
      },
    },
  });
}

/** Tìm các slot khác của CÙNG giáo viên (qua assignment.teacherId) trùng (kỳ, thứ, tiết) — dùng để chặn trùng giờ dạy. */
export function findTeacherSlotsAtSameTime(
  teacherId: string,
  versionId: string,
  dayOfWeek: number,
  periodNo: number,
) {
  return prisma.timetableSlot.findMany({
    where: {
      versionId,
      dayOfWeek,
      periodNo,
      assignment: { teacherId },
    },
  });
}

export function createTimetableSlot(input: CreateTimetableSlotInput) {
  return prisma.timetableSlot.create({ data: input });
}

export function listSlotsBySchoolClass(
  schoolClassId: string,
  academicTermId: string,
) {
  return prisma.timetableSlot.findMany({
    where: { schoolClassId, academicTermId, ...effectiveSlots() },
    include: { assignment: { include: { subject: true, teacher: true } }, room: true },
    orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }],
  });
}

export function listSlotsByTeacher(
  teacherId: string,
  academicTermId: string,
) {
  return prisma.timetableSlot.findMany({
    where: { academicTermId, assignment: { teacherId }, ...effectiveSlots() },
    include: { assignment: { include: { subject: true, schoolClass: true } }, room: true },
    orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }],
  });
}

export function deleteTimetableSlot(id: string) {
  return prisma.timetableSlot.delete({ where: { id } });
}

export function findTimetableSlot(id: string) {
  return prisma.timetableSlot.findUnique({ where: { id } });
}

/** Một lớp không thể có 2 môn cùng (kỳ, thứ, tiết) — ràng buộc ở cấp lớp, không phải cấp phân công. */
export function findClassSlotsAtSameTime(
  schoolClassId: string,
  versionId: string,
  dayOfWeek: number,
  periodNo: number,
) {
  return prisma.timetableSlot.findMany({
    where: { schoolClassId, versionId, dayOfWeek, periodNo },
  });
}

export function updateTimetableSlot(
  id: string,
  data: { dayOfWeek: number; periodNo: number; roomId: string },
) {
  return prisma.timetableSlot.update({ where: { id }, data });
}

export function countLogsOfSlot(timetableSlotId: string) {
  return prisma.classPeriodLog.count({ where: { timetableSlotId } });
}

export function listSlotsOfTerm(academicTermId: string) {
  return prisma.timetableSlot.findMany({
    where: { academicTermId, ...effectiveSlots() },
    include: { assignment: { select: { teacherId: true } } },
  });
}

export function deleteSlotsOfTerm(academicTermId: string) {
  return prisma.timetableSlot.deleteMany({ where: { academicTermId } });
}

export function createManyTimetableSlots(
  data: { versionId: string; schoolClassId: string; assignmentId: string; roomId: string; academicTermId: string; dayOfWeek: number; periodNo: number }[],
) {
  return prisma.timetableSlot.createMany({ data });
}

export function listTerms() {
  return prisma.academicTerm.findMany({
    include: { academicYear: true },
    orderBy: [{ startDate: "desc" }],
  });
}
