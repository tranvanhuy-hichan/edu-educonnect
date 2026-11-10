import { prisma } from "@/lib/prisma";
import type { CreateYearEndResultInput } from "@/modules/promotion/promotion.schema";

export function upsertYearEndResult(input: CreateYearEndResultInput) {
  return prisma.yearEndResult.upsert({
    where: {
      studentId_academicYearId: {
        studentId: input.studentId,
        academicYearId: input.academicYearId,
      },
    },
    update: {
      overallAverage: input.overallAverage,
      conductRank: input.conductRank,
      result: input.result,
    },
    create: input,
  });
}

export function listYearEndResultsByYear(academicYearId: string) {
  return prisma.yearEndResult.findMany({
    where: { academicYearId },
    include: { student: true },
  });
}

export function createPromotionJob(
  academicYearFromId: string,
  academicYearToId: string,
) {
  return prisma.classPromotionJob.create({
    data: { academicYearFromId, academicYearToId, status: "RUNNING" },
  });
}

export function markPromotionJobDone(id: string, log: string) {
  return prisma.classPromotionJob.update({
    where: { id },
    data: { status: "DONE", log },
  });
}

export function markPromotionJobFailed(id: string, log: string) {
  return prisma.classPromotionJob.update({
    where: { id },
    data: { status: "FAILED", log },
  });
}

export function createEnrollmentsBatch(
  entries: { studentId: string; schoolClassId: string; academicYearId: string }[],
) {
  return prisma.studentClassEnrollment.createMany({
    data: entries,
    skipDuplicates: true,
  });
}

export function findSchoolClass(id: string) {
  return prisma.schoolClass.findUnique({ where: { id } });
}
