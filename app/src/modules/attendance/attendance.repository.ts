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
  const { absences: _a, ...data } = input;
  void _a;
  return prisma.classPeriodLog.create({
    data: { ...data, schoolClassId },
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
  const { absences, ...data } = input;
  return prisma.$transaction(async (tx) => {
    const log = await tx.classPeriodLog.upsert({
      where: { timetableSlotId_logDate: { timetableSlotId: input.timetableSlotId, logDate: input.logDate } },
      update: { attendanceAbsentCount: data.attendanceAbsentCount, conductRating: data.conductRating ?? null, note: data.note ?? null, lessonTitle: data.lessonTitle ?? null },
      create: { ...data, schoolClassId },
    });
    if (absences) {
      await tx.classPeriodAbsence.deleteMany({ where: { logId: log.id } });
      if (absences.length) await tx.classPeriodAbsence.createMany({ data: absences.map((a) => ({ logId: log.id, studentId: a.studentId, excused: a.excused })) });
    }
    return log;
  });
}

/** Mã các học sinh đang học lớp (để kiểm tra danh sách vắng). */
export async function enrolledStudentIds(schoolClassId: string) {
  return new Set((await prisma.studentClassEnrollment.findMany({ where: { schoolClassId }, select: { studentId: true } })).map((e) => e.studentId));
}

export function countEnrollmentsOfClass(schoolClassId: string) {
  return prisma.studentClassEnrollment.count({ where: { schoolClassId } });
}

export function findTermOfSlot(academicTermId: string) {
  return prisma.academicTerm.findUnique({ where: { id: academicTermId } });
}
