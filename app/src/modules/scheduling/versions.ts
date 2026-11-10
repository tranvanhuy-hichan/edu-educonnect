import { withTransaction, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
import { scheduleRepository } from "./scheduling.repository";
import { isoDate, mondayOf, parseDate } from "@/lib/format";

export function parseStartingWeek(value: string) {
  const date = parseDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || isoDate(date) !== value) {
    throw new Error("Chọn ngày thuộc tuần bắt đầu áp dụng thời khóa biểu");
  }
  return mondayOf(date);
}

/** Serialize mutations within a term so two creations cannot leave overlapping intervals. */
export async function lockTimetableTerm(tx: DatabaseContext, termId: string) {
  await scheduleRepository(tx).lockTerm(termId);
}

export async function insertVersion(tx: DatabaseContext, termId: string, startsOn: Date) {
  const term = await scheduleRepository(tx).term(termId);
  if (startsOn < mondayOf(term.startDate) || startsOn > mondayOf(term.endDate)) {
    throw new Error("Tuần bắt đầu phải nằm trong học kỳ đã chọn");
  }
  if (await scheduleRepository(tx).versionStartingOn(termId, startsOn)) {
    throw new Error("Tuần này đã có một thời khóa biểu. Hãy sửa phiên bản đó hoặc chọn tuần khác.");
  }
  const previous = await scheduleRepository(tx).previousVersion(termId, startsOn);
  const next = await scheduleRepository(tx).nextVersion(termId, startsOn);
  // Never make existing diary entries fall outside the schedule they reference.
  if (previous && await scheduleRepository(tx).logsAfterVersion(previous.id, startsOn)) {
    throw new Error("Lịch cũ đã có sổ đầu bài từ tuần này trở đi. Chọn tuần sau các ngày đã ghi sổ.");
  }
  const version = await scheduleRepository(tx).createVersion(termId, startsOn, next?.startsOn ?? null);
  if (previous) await scheduleRepository(tx).endVersion(previous.id, startsOn);
  return { version, previous };
}

export async function createVersion(termId: string, startsOn: Date, copyPrevious: boolean) {
  return withTransaction(async (tx) => {
    await lockTimetableTerm(tx, termId);
    const { version, previous } = await insertVersion(tx, termId, startsOn);
    if (copyPrevious && previous) {
      const slots = await scheduleRepository(tx).versionSlots(previous.id);
      await scheduleRepository(tx).insertSlots(slots.map((s) => ({ versionId: version.id, academicTermId: termId, schoolClassId: s.schoolClassId, assignmentId: s.assignmentId, roomId: s.roomId, dayOfWeek: s.dayOfWeek, periodNo: s.periodNo })));
    }
    return version;
  });
}
