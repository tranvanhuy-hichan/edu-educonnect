import { prisma } from "@/lib/prisma";

export type ParentNoticeRow = { phoneKey: string; studentId: string; title: string; content: string; type: string; link: string };

export const insertParentNotices = (rows: ParentNoticeRow[]) => prisma.parentNotification.createMany({ data: rows });
export const parentNoticesFor = (phoneKey: string, limit: number) => prisma.parentNotification.findMany({ where: { phoneKey }, orderBy: { createdAt: "desc" }, take: limit });
export const parentUnread = (phoneKey: string) => prisma.parentNotification.count({ where: { phoneKey, isRead: false } });
export const parentReadOne = (id: string, phoneKey: string) => prisma.parentNotification.updateMany({ where: { id, phoneKey }, data: { isRead: true } });
export const parentReadAll = (phoneKey: string) => prisma.parentNotification.updateMany({ where: { phoneKey, isRead: false }, data: { isRead: true } });

/** Thông tin cần để báo cho học sinh và phụ huynh của các học sinh. */
export const studentsForNotice = (ids: string[]) => prisma.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, userId: true, guardianPhone: true } });
export const studentsOfYearForNotice = (academicYearId: string) => prisma.student.findMany({
  where: { enrollments: { some: { academicYearId } } }, select: { id: true, fullName: true, userId: true, guardianPhone: true },
});
export const absenceStudentIds = async (timetableSlotId: string, logDate: Date) =>
  (await prisma.classPeriodAbsence.findMany({ where: { log: { timetableSlotId, logDate } }, select: { studentId: true } })).map((a) => a.studentId);
