import type { Prisma } from "@prisma/client";
import { databaseFor } from "@/infrastructure/database/unit-of-work";
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

// Transaction-bound operations for year-end use cases.
export function yearResultRepository(context?: import("@/infrastructure/database/unit-of-work").DatabaseContext) {
  const db = databaseFor(context);
  return {
    find: (studentId: string, academicYearId: string) => db.yearEndResult.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId } } }),
    save: (studentId: string, academicYearId: string, data: Omit<Prisma.YearEndResultUncheckedCreateInput, "studentId" | "academicYearId">) => db.yearEndResult.upsert({ where: { studentId_academicYearId: { studentId, academicYearId } }, create: { studentId, academicYearId, ...data }, update: data }),
    update: (studentId: string, academicYearId: string, data: Prisma.YearEndResultUncheckedUpdateInput) => db.yearEndResult.update({ where: { studentId_academicYearId: { studentId, academicYearId } }, data }),
    completeJob: (id: string, log: string) => db.classPromotionJob.update({ where: { id }, data: { status: "DONE", log } }),
  };
}
export const classesForYear = (academicYearId: string) => prisma.schoolClass.findMany({ where: { academicYearId }, orderBy: { className: "asc" } });
export const approvedClassResults = (academicYearId: string, schoolClassId: string) => prisma.yearEndResult.findMany({ where: { academicYearId, reviewStatus: "APPROVED", student: { enrollments: { some: { schoolClassId, academicYearId } } } }, select: { studentId: true, result: true } });
export const classYearReview = (schoolClassId: string, academicYearId: string) => prisma.studentClassEnrollment.findMany({ where: { schoolClassId, academicYearId }, include: { student: { include: { yearEndResults: { where: { academicYearId } } } } }, orderBy: { student: { fullName: "asc" } } });
