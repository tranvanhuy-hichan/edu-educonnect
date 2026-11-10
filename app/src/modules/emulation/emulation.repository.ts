import { prisma } from "@/lib/prisma";
import type { CreateEmulationCriteriaInput } from "@/modules/emulation/emulation.schema";

export function createCriteria(input: CreateEmulationCriteriaInput) {
  return prisma.emulationCriteria.create({ data: input });
}

export function listCriteria() {
  return prisma.emulationCriteria.findMany();
}

export type DateRange = { from?: Date; to?: Date };
const inRange = (r?: DateRange) => (r?.from || r?.to ? { logDate: { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lte: r.to } : {}) } } : {});

/** Tổng số lượt vắng + xếp loại tiết không TOT trong lớp (trong khoảng ngày nếu có), dùng làm điểm trừ nền nếp. */
export function aggregatePeriodLogStats(schoolClassId: string, range?: DateRange) {
  return prisma.classPeriodLog.aggregate({
    where: { schoolClassId, ...inRange(range) },
    _sum: { attendanceAbsentCount: true },
    _count: { id: true },
  });
}

export function countNonTotPeriodLogs(schoolClassId: string, range?: DateRange) {
  return prisma.classPeriodLog.count({
    where: { schoolClassId, conductRating: { not: "TOT" }, ...inRange(range) },
  });
}

/** Điểm TB học tập trung bình của cả lớp trong kỳ (trung bình các SubjectTermAverage của HS trong lớp). */
export async function averageSubjectScoreForClass(
  schoolClassId: string,
  academicTermId: string,
) {
  const result = await prisma.subjectTermAverage.aggregate({
    where: {
      academicTermId,
      student: {
        enrollments: { some: { schoolClassId } },
      },
    },
    _avg: { averageValue: true },
  });
  return result._avg.averageValue ?? 0;
}

export function upsertClassEmulationScore(
  schoolClassId: string,
  academicTermId: string,
  periodLabel: string,
  totalScore: number,
) {
  return prisma.classEmulationScore.upsert({
    where: {
      schoolClassId_academicTermId_periodLabel: {
        schoolClassId,
        academicTermId,
        periodLabel,
      },
    },
    update: { totalScore },
    create: { schoolClassId, academicTermId, periodLabel, totalScore },
  });
}

/** Xếp hạng toàn trường: cập nhật rank theo totalScore giảm dần trong cùng (kỳ, periodLabel). */
export async function recalculateRanks(
  academicTermId: string,
  periodLabel: string,
) {
  const scores = await prisma.classEmulationScore.findMany({
    where: { academicTermId, periodLabel },
    orderBy: { totalScore: "desc" },
  });

  await Promise.all(
    scores.map((score, index) =>
      prisma.classEmulationScore.update({
        where: { id: score.id },
        data: { rank: index + 1 },
      }),
    ),
  );

  return scores;
}

export function listRankingByTerm(academicTermId: string, periodLabel: string) {
  return prisma.classEmulationScore.findMany({
    where: { academicTermId, periodLabel },
    include: { schoolClass: true },
    orderBy: { rank: "asc" },
  });
}

/** Lịch sử điểm thi đua của riêng 1 lớp qua các kỳ — dùng cho trang tổng hợp GVCN. */
export function listEmulationScoresBySchoolClass(schoolClassId: string) {
  return prisma.classEmulationScore.findMany({
    where: { schoolClassId },
    orderBy: { periodLabel: "desc" },
  });
}

export function listClassesOfYear(academicYearId: string) {
  return prisma.schoolClass.findMany({ where: { academicYearId }, select: { id: true }, orderBy: { className: "asc" } });
}

export function findTerm(academicTermId: string) {
  return prisma.academicTerm.findUnique({ where: { id: academicTermId } });
}
