import { prisma } from "@/lib/prisma";
import type { CreateClassPeriodLogInput } from "@/modules/attendance/attendance.schema";

export function findTimetableSlotWithAssignment(timetableSlotId: string) {
  return prisma.timetableSlot.findUnique({
    where: { id: timetableSlotId },
    include: { assignment: true, version: true },
  });
}

export function findLogByCreateInput(
  timetableSlotId: string,
  logDate: Date,
) {
  return prisma.classPeriodLog.findUnique({
    where: { timetableSlotId_logDate: { timetableSlotId, logDate } },
  });
}

export function createClassPeriodLog(
  schoolClassId: string,
  input: CreateClassPeriodLogInput,
) {
  return prisma.classPeriodLog.create({
    data: { ...input, schoolClassId },
  });
}

export function listLogsBySchoolClass(schoolClassId: string) {
  return prisma.classPeriodLog.findMany({
    where: { schoolClassId },
    include: { timetableSlot: { include: { assignment: { include: { subject: true } } } } },
    orderBy: { logDate: "desc" },
  });
}

/** Ghi sổ đầu bài: thêm mới hoặc cập nhật nếu (tiết, ngày) đã có bản ghi. */
export function upsertClassPeriodLog(schoolClassId: string, input: CreateClassPeriodLogInput) {
  return prisma.classPeriodLog.upsert({
    where: { timetableSlotId_logDate: { timetableSlotId: input.timetableSlotId, logDate: input.logDate } },
    update: { attendanceAbsentCount: input.attendanceAbsentCount, conductRating: input.conductRating ?? null, note: input.note ?? null },
    create: { ...input, schoolClassId },
  });
}

export function countEnrollmentsOfClass(schoolClassId: string) {
  return prisma.studentClassEnrollment.count({ where: { schoolClassId } });
}

export function findTermOfSlot(academicTermId: string) {
  return prisma.academicTerm.findUnique({ where: { id: academicTermId } });
}
