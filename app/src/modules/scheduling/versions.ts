import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { isoDate, mondayOf, parseDate } from "@/lib/format";

export function parseStartingWeek(value: string) {
  const date = parseDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || isoDate(date) !== value) {
    throw new Error("Chọn ngày thuộc tuần bắt đầu áp dụng thời khóa biểu");
  }
  return mondayOf(date);
}

/** Serialize mutations within a term so two creations cannot leave overlapping intervals. */
export async function lockTimetableTerm(tx: Prisma.TransactionClient, termId: string) {
  await tx.$queryRaw`SELECT "id" FROM "AcademicTerm" WHERE "id" = ${termId} FOR UPDATE`;
}

export async function insertVersion(tx: Prisma.TransactionClient, termId: string, startsOn: Date) {
  const term = await tx.academicTerm.findUniqueOrThrow({ where: { id: termId } });
  if (startsOn < mondayOf(term.startDate) || startsOn > mondayOf(term.endDate)) {
    throw new Error("Tuần bắt đầu phải nằm trong học kỳ đã chọn");
  }
  if (await tx.timetableVersion.findUnique({ where: { academicTermId_startsOn: { academicTermId: termId, startsOn } } })) {
    throw new Error("Tuần này đã có một thời khóa biểu. Hãy sửa phiên bản đó hoặc chọn tuần khác.");
  }
  const previous = await tx.timetableVersion.findFirst({ where: { academicTermId: termId, startsOn: { lt: startsOn } }, orderBy: { startsOn: "desc" } });
  const next = await tx.timetableVersion.findFirst({ where: { academicTermId: termId, startsOn: { gt: startsOn } }, orderBy: { startsOn: "asc" } });
  // Never make existing diary entries fall outside the schedule they reference.
  if (previous && await tx.classPeriodLog.count({ where: { timetableSlot: { versionId: previous.id }, logDate: { gte: startsOn } } })) {
    throw new Error("Lịch cũ đã có sổ đầu bài từ tuần này trở đi. Chọn tuần sau các ngày đã ghi sổ.");
  }
  const version = await tx.timetableVersion.create({ data: { academicTermId: termId, startsOn, endsOn: next?.startsOn ?? null } });
  if (previous) await tx.timetableVersion.update({ where: { id: previous.id }, data: { endsOn: startsOn } });
  return { version, previous };
}

export async function createVersion(termId: string, startsOn: Date, copyPrevious: boolean) {
  return prisma.$transaction(async (tx) => {
    await lockTimetableTerm(tx, termId);
    const { version, previous } = await insertVersion(tx, termId, startsOn);
    if (copyPrevious && previous) {
      const slots = await tx.timetableSlot.findMany({ where: { versionId: previous.id } });
      await tx.timetableSlot.createMany({ data: slots.map((s) => ({ versionId: version.id, academicTermId: termId, schoolClassId: s.schoolClassId, assignmentId: s.assignmentId, roomId: s.roomId, dayOfWeek: s.dayOfWeek, periodNo: s.periodNo })) });
    }
    return version;
  });
}
