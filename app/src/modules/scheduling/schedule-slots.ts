import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Common activities have no subject assignment or diary entry. Adapt them for schedule displays only. */
export async function loadScheduleSlots(where: Prisma.TimetableSlotWhereInput, client: Pick<Prisma.TransactionClient, "timetableSlot" | "timetableActivity"> = db) {
  const schoolClass = { include: { gradeLevel: true, homeroomTeacher: true, _count: { select: { enrollments: true } } } } as const;
  const lessons = await client.timetableSlot.findMany({ where, orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }], include: { schoolClass, assignment: { include: { subject: true, teacher: true } }, room: true } });
  const w = where as { academicTermId?: string; version?: Prisma.TimetableVersionWhereInput; schoolClassId?: string; schoolClass?: Prisma.SchoolClassWhereInput; assignment?: { teacherId: string }; roomId?: string; OR?: { assignment?: { teacherId: string }; schoolClass?: Prisma.SchoolClassWhereInput }[]; dayOfWeek?: number };
  const activities = await client.timetableActivity.findMany({ where: {
    version: { ...(w.academicTermId ? { academicTermId: w.academicTermId } : {}), ...(w.version ?? {}) },
    ...(w.schoolClassId ? { schoolClassId: w.schoolClassId } : {}),
    ...(w.dayOfWeek ? { dayOfWeek: w.dayOfWeek } : {}),
    schoolClass: { AND: [w.schoolClass ?? {}, ...(w.assignment ? [{ assignments: { some: { teacherId: w.assignment.teacherId } } }] : []), ...(w.roomId ? [{ roomId: w.roomId }] : []), ...(w.OR ? [{ OR: w.OR.map((item) => item.schoolClass ?? { assignments: { some: { teacherId: item.assignment?.teacherId } } }) }] : [])] },
  }, include: { schoolClass, version: true } });
  const result = lessons.map((slot) => ({ ...slot, kind: "lesson" as "lesson" | "activity" }));
  for (const activity of activities) {
    const id = `activity:${activity.id}`;
    result.push({ id, versionId: activity.versionId, schoolClassId: activity.schoolClassId, academicTermId: activity.version.academicTermId, assignmentId: id, roomId: id, dayOfWeek: activity.dayOfWeek, periodNo: activity.periodNo, schoolClass: activity.schoolClass, kind: "activity",
      room: { id, roomName: "Hoạt động chung", roomType: "ACTIVITY", capacity: 0 },
      assignment: { id, schoolClassId: activity.schoolClassId, subjectId: id, teacherId: "", academicTermId: activity.version.academicTermId, subject: { id, subjectName: activity.name, defaultPeriodsPerWeek: 0 }, teacher: { id: "", code: null, userId: "", fullName: "Theo kế hoạch nhà trường", phone: null } },
    });
  }
  return result.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodNo - b.periodNo);
}
