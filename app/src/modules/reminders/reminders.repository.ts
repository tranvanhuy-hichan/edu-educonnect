import { prisma } from "@/lib/prisma";

/** Đánh dấu đã gửi; trả về các khoá MỚI (chưa từng gửi). Chạy lại tác vụ không bao giờ gửi trùng. */
export async function claimKeys(keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await prisma.$queryRaw<{ key: string }[]>`INSERT INTO "ReminderSent" ("key") SELECT unnest(${keys}::text[]) ON CONFLICT DO NOTHING RETURNING "key"`;
  return new Set(rows.map((r) => r.key));
}
export const releaseKeys = (keys: string[]) => prisma.reminderSent.deleteMany({ where: { key: { in: keys } } });

const studentSel = { id: true, fullName: true, userId: true, guardianPhone: true } as const;
const titleSel = { select: { bookTitle: { select: { title: true } } } } as const;

export const loansDueBetween = (start: Date, end: Date) => prisma.libraryLoan.findMany({
  where: { dueDate: { gte: start, lt: end }, status: { in: ["BORROWED", "PARTIALLY_RETURNED"] } },
  select: { id: true, dueDate: true, student: { select: studentSel }, bookCopy: titleSel, items: { where: { returnedDate: null }, select: { bookCopy: titleSel } } },
});

export const exercisesDueBetween = (start: Date, end: Date) => prisma.exercise.findMany({
  where: { dueDate: { gte: start, lt: end } },
  select: {
    id: true, title: true, dueDate: true, submissions: { select: { studentId: true } },
    lessonPost: { select: { id: true, assignment: { select: { schoolClassId: true, subject: { select: { subjectName: true } }, academicTerm: { select: { academicYearId: true } } } } } },
  },
});
export const classStudents = (schoolClassId: string, academicYearId: string) => prisma.studentClassEnrollment.findMany({ where: { schoolClassId, academicYearId }, select: { student: { select: studentSel } } });

export const examPapersBetween = (start: Date, end: Date) => prisma.examPaper.findMany({
  where: { startsAt: { gte: start, lt: end }, event: { status: "PUBLISHED" } },
  select: {
    id: true, startsAt: true, reportMinutes: true, subject: { select: { subjectName: true } },
    rooms: { select: { label: true, room: { select: { roomName: true } }, invigilators: { select: { teacher: { select: { id: true, userId: true } } } } } },
    seats: { select: { examRoomId: true, student: { select: studentSel }, examRoom: { select: { label: true, room: { select: { roomName: true } } } } } },
  },
});
