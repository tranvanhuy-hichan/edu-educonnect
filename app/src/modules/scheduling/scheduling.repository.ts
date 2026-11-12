import type { Prisma } from "@prisma/client";
import { databaseFor, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
import type { ScheduleOptions } from "./options";
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

export function scheduleRepository(context?: DatabaseContext) {
  const db = databaseFor(context);
  return {
    version: (id: string) => db.timetableVersion.findUnique({ where: { id } }),
    assignment: (id: string) => db.classSubjectAssignment.findUnique({ where: { id } }),
    schoolClass: (id: string) => db.schoolClass.findUniqueOrThrow({ where: { id } }),
    slot: (id: string) => db.timetableSlot.findUniqueOrThrow({ where: { id } }),
    loggedSlotCount: (id: string) => db.classPeriodLog.count({ where: { timetableSlotId: id } }),
    placementConflicts: (input: CreateTimetableSlotInput, teacherId: string, excludeId?: string) => db.timetableSlot.findMany({ where: { versionId: input.versionId, dayOfWeek: input.dayOfWeek, periodNo: input.periodNo, ...(excludeId ? { id: { not: excludeId } } : {}), OR: [{ roomId: input.roomId }, { schoolClassId: input.schoolClassId }, { assignment: { teacherId } }] }, include: { assignment: true } }),
    createSlot: (data: CreateTimetableSlotInput) => db.timetableSlot.create({ data }),
    updateSlot: (id: string, data: { dayOfWeek: number; periodNo: number; roomId: string }) => db.timetableSlot.update({ where: { id }, data }),
    assignmentsForTerm: (academicTermId: string) => db.classSubjectAssignment.findMany({ where: { academicTermId }, include: { subject: true, schoolClass: true, teacher: true }, orderBy: [{ schoolClass: { className: "asc" } }, { subject: { subjectName: "asc" } }] }),
    rooms: () => db.room.findMany({ orderBy: { roomName: "asc" } }),
    term: (id: string) => db.academicTerm.findUniqueOrThrow({ where: { id }, include: { academicYear: true } }),
    classesForYear: (academicYearId: string) => db.schoolClass.findMany({ where: { academicYearId }, include: { gradeLevel: true, subjects: { include: { subject: true } } }, orderBy: { className: "asc" } }),
    grades: () => db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    saveOptions: (id: string, settings: ScheduleOptions) => db.timetableVersion.update({ where: { id }, data: { settings } }),
    insertActivities: (data: Prisma.TimetableActivityCreateManyInput[]) => db.timetableActivity.createMany({ data }),
    insertSlots: (data: Prisma.TimetableSlotCreateManyInput[]) => db.timetableSlot.createMany({ data }),
    lockTerm: (id: string) => db.$queryRaw`SELECT "id" FROM "edu"."AcademicTerm" WHERE "id" = ${id} FOR UPDATE`,
    versionStartingOn: (academicTermId: string, startsOn: Date) => db.timetableVersion.findUnique({ where: { academicTermId_startsOn: { academicTermId, startsOn } } }),
    previousVersion: (academicTermId: string, startsOn: Date) => db.timetableVersion.findFirst({ where: { academicTermId, startsOn: { lt: startsOn } }, orderBy: { startsOn: "desc" } }),
    nextVersion: (academicTermId: string, startsOn: Date) => db.timetableVersion.findFirst({ where: { academicTermId, startsOn: { gt: startsOn } }, orderBy: { startsOn: "asc" } }),
    logsAfterVersion: (versionId: string, startsOn: Date) => db.classPeriodLog.count({ where: { timetableSlot: { versionId }, logDate: { gte: startsOn } } }),
    createVersion: (academicTermId: string, startsOn: Date, endsOn: Date | null) => db.timetableVersion.create({ data: { academicTermId, startsOn, endsOn } }),
    endVersion: (id: string, endsOn: Date) => db.timetableVersion.update({ where: { id }, data: { endsOn } }),
    versionSlots: (versionId: string) => db.timetableSlot.findMany({ where: { versionId } }),
  };
}
