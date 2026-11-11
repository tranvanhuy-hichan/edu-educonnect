import type { Prisma } from "@prisma/client";
import { databaseFor, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
import { prisma } from "@/lib/prisma";
import type {
  CreateScoreEntryInput,
  UpsertScoreWeightConfigInput,
} from "@/modules/scoring/scoring.schema";

export function findScoreWeightConfig(academicTermId: string) {
  return prisma.scoreWeightConfig.findUnique({ where: { academicTermId } });
}

export function upsertScoreWeightConfig(input: UpsertScoreWeightConfigInput) {
  return prisma.scoreWeightConfig.upsert({
    where: { academicTermId: input.academicTermId },
    update: {
      txWeight: input.txWeight,
      gkWeight: input.gkWeight,
      ckWeight: input.ckWeight,
    },
    create: input,
  });
}

export function createScoreEntry(input: CreateScoreEntryInput) {
  return prisma.scoreEntry.create({ data: input });
}

export function listScoreEntries(
  studentId: string,
  assignmentId: string,
  academicTermId: string,
) {
  return prisma.scoreEntry.findMany({
    where: { studentId, assignmentId, academicTermId },
    orderBy: { createdAt: "asc" },
  });
}

export function upsertSubjectTermAverage(
  studentId: string,
  assignmentId: string,
  academicTermId: string,
  averageValue: number,
) {
  return prisma.subjectTermAverage.upsert({
    where: {
      studentId_assignmentId_academicTermId: {
        studentId,
        assignmentId,
        academicTermId,
      },
    },
    update: { averageValue },
    create: { studentId, assignmentId, academicTermId, averageValue },
  });
}

export function findAssignmentTeacherId(assignmentId: string) {
  return prisma.classSubjectAssignment.findUnique({
    where: { id: assignmentId },
    select: { teacherId: true },
  });
}

/** Lưới điểm TB môn của toàn bộ học sinh trong 1 lớp, theo 1 học kỳ — dùng cho trang tổng hợp GVCN. */
export function listSubjectTermAveragesByClass(
  schoolClassId: string,
  academicTermId: string,
) {
  return prisma.subjectTermAverage.findMany({
    where: {
      academicTermId,
      student: { enrollments: { some: { schoolClassId } } },
    },
    include: {
      student: { select: { id: true, fullName: true } },
      assignment: { include: { subject: true } },
    },
    orderBy: [{ student: { fullName: "asc" } }],
  });
}

export function gradingRepository(context?: DatabaseContext) {
  const db = databaseFor(context);
  return {
    assignment: (id: string) => db.classSubjectAssignment.findUniqueOrThrow({ where: { id }, include: { academicTerm: true, subject: true, schoolClass: true } }),
    term: (id: string) => db.academicTerm.findUniqueOrThrow({ where: { id } }),
    lockTermRow: (id: string) => db.$queryRaw`SELECT "id" FROM "AcademicTerm" WHERE "id" = ${id} FOR UPDATE`,
    activeUnlock: (requestedBy: string, assignmentId: string, now: Date) => db.scoreUnlockRequest.findFirst({ where: { requestedBy, assignmentId, status: "APPROVED", expiresAt: { gt: now } }, orderBy: { expiresAt: "desc" } }),
    pendingUnlock: (requestedBy: string, assignmentId: string) => db.scoreUnlockRequest.findFirst({ where: { requestedBy, assignmentId, status: "SUBMITTED" } }),
    lockUnlockRequest: (id: string) => db.$queryRaw`SELECT "id" FROM "ScoreUnlockRequest" WHERE "id" = ${id} FOR UPDATE`,
    unlockRequest: (id: string) => db.scoreUnlockRequest.findUniqueOrThrow({ where: { id } }),
    createUnlock: (data: Prisma.ScoreUnlockRequestUncheckedCreateInput) => db.scoreUnlockRequest.create({ data }),
    reviewUnlock: (id: string, data: Prisma.ScoreUnlockRequestUncheckedUpdateInput) => db.scoreUnlockRequest.update({ where: { id }, data }),
    lockTerm: (id: string, actor: string, now: Date) => db.academicTerm.update({ where: { id }, data: { isLocked: true, lockedAt: now, lockedBy: actor } }),
    expireUnlocks: (academicTermId: string, now: Date) => db.scoreUnlockRequest.updateMany({ where: { academicTermId, status: "APPROVED" }, data: { expiresAt: now } }),
    assessment: (studentId: string, assignmentId: string) => db.studentAssessment.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId } } }),
    saveAssessment: (studentId: string, assignmentId: string, data: Omit<Prisma.StudentAssessmentUncheckedCreateInput, "studentId" | "assignmentId">) => db.studentAssessment.upsert({ where: { studentId_assignmentId: { studentId, assignmentId } }, create: { studentId, assignmentId, ...data }, update: data }),
    entries: (studentId: string, assignmentId: string, academicTermId: string) => db.scoreEntry.findMany({ where: { studentId, assignmentId, academicTermId }, orderBy: { createdAt: "asc" } }),
    removeEntries: (studentId: string, assignmentId: string, academicTermId: string) => db.scoreEntry.deleteMany({ where: { studentId, assignmentId, academicTermId } }),
    insertEntries: (data: Prisma.ScoreEntryCreateManyInput[]) => db.scoreEntry.createMany({ data }),
    insertEntry: (data: Prisma.ScoreEntryUncheckedCreateInput) => db.scoreEntry.create({ data }),
    average: (studentId: string, assignmentId: string, academicTermId: string, averageValue: number) => db.subjectTermAverage.upsert({ where: { studentId_assignmentId_academicTermId: { studentId, assignmentId, academicTermId } }, create: { studentId, assignmentId, academicTermId, averageValue }, update: { averageValue } }),
    removeAverage: (studentId: string, assignmentId: string, academicTermId: string) => db.subjectTermAverage.deleteMany({ where: { studentId, assignmentId, academicTermId } }),
    enrollmentCurriculum: (studentId: string, academicYearId: string) => db.studentClassEnrollment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId } }, include: { schoolClass: { include: { subjects: { include: { subject: true }, orderBy: { subjectId: "asc" } } } } } }),
    annualAssignments: (studentId: string, academicYearId: string, schoolClassId: string) => db.classSubjectAssignment.findMany({ where: { schoolClassId, academicTerm: { academicYearId } }, include: { academicTerm: { include: { scoreWeightConfig: true } }, scoreEntries: { where: { studentId } }, assessments: { where: { studentId } } } }),
  };
}
