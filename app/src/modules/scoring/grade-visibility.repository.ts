import { prisma } from "@/lib/prisma";

export const findTerm = (id: string) => prisma.academicTerm.findUniqueOrThrow({ where: { id }, include: { academicYear: true } });
export const setHidden = (id: string, data: { gradesHidden: boolean; gradesHiddenAt: Date | null; gradesHiddenBy: string | null; gradesHiddenNote: string | null }) => prisma.academicTerm.update({ where: { id }, data });
export async function studentUserIdsOfYear(academicYearId: string) {
  return (await prisma.studentClassEnrollment.findMany({ where: { academicYearId }, select: { student: { select: { userId: true } } } })).map((e) => e.student.userId);
}
