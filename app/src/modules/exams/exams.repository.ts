import type { Prisma } from "@prisma/client";
import { databaseFor, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
export function examRepository(context?: DatabaseContext) {
  const db = databaseFor(context);
  return {
    term: (id: string) => db.academicTerm.findUniqueOrThrow({ where: { id }, include: { academicYear: true } }),
    grade: (id: string) => db.gradeLevel.findUniqueOrThrow({ where: { id } }),
    subject: (id: string) => db.subject.findUniqueOrThrow({ where: { id } }),
    candidates: (academicYearId: string, gradeLevelId: string, subjectId: string) => db.studentClassEnrollment.findMany({ where: { academicYearId, schoolClass: { gradeLevelId, subjects: { some: { subjectId } } }, student: { user: { isActive: true } } }, include: { student: true, schoolClass: true } }),
    rooms: () => db.room.findMany({ orderBy: [{ capacity: "asc" }, { roomName: "asc" }] }),
    activeTeachers: () => db.teacher.findMany({ where: { user: { isActive: true } }, orderBy: { fullName: "asc" } }),
    overlappingReservations: (earliest: Date, latest: Date, excludeEventId?: string) => db.examRoom.findMany({ where: { paper: { event: { status: { not: "CANCELLED" }, ...(excludeEventId ? { id: { not: excludeEventId } } : {}) }, startsAt: { lt: latest }, endsAt: { gt: earliest } } }, include: { paper: { include: { event: true, subject: true } }, invigilators: true, seats: { select: { studentId: true } } } }),
    futureReservations: (now: Date, eventId?: string) => db.examRoom.findMany({ where: { paper: { event: { status: { not: "CANCELLED" }, ...(eventId ? { id: { not: eventId } } : {}) }, endsAt: { gt: now } } }, include: { paper: true, invigilators: true, seats: { select: { studentId: true } } } }),
    lock: () => db.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(20261110, 1600)`,
    event: (id: string) => db.examEvent.findUniqueOrThrow({ where: { id }, include: { papers: { include: { rooms: { include: { room: true, invigilators: { include: { teacher: { include: { user: true } } } }, seats: true } } } } } }),
    createEvent: (data: Prisma.ExamEventUncheckedCreateInput) => db.examEvent.create({ data }),
    updateEvent: (id: string, data: Prisma.ExamEventUncheckedUpdateInput) => db.examEvent.update({ where: { id }, data }),
    clearPapers: (eventId: string) => db.examPaper.deleteMany({ where: { eventId } }),
    createPaper: (data: Prisma.ExamPaperUncheckedCreateInput) => db.examPaper.create({ data }),
    createRoom: (data: Prisma.ExamRoomUncheckedCreateInput) => db.examRoom.create({ data }),
    createSeats: (data: Prisma.ExamSeatCreateManyInput[]) => db.examSeat.createMany({ data }),
  };
}
