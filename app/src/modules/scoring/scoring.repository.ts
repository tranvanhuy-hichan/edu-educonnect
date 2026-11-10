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
