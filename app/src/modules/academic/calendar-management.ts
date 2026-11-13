import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
/** Remove an unused year on both sides in one transaction; any dependency failure rolls everything back. */
export async function deleteSharedAcademicYear(id: string, context?: Prisma.TransactionClient): Promise<void> {
  if (!context) return prisma.$transaction((tx) => deleteSharedAcademicYear(id, tx));
  const tx = context;
  const year = await tx.academicYear.findUniqueOrThrow({ where: { id } });
  const classes = await tx.schoolClass.count({ where: { academicYearId: id } });
  const enrollments = await tx.studentClassEnrollment.count({ where: { academicYearId: id } });
  if (classes || enrollments) throw new Error("Năm học đã có lớp/học sinh, không thể xoá");
  const terms = await tx.academicTerm.findMany({ where: { academicYearId: id }, select: { id: true } });
  const used = await tx.classSubjectAssignment.count({ where: { academicTermId: { in: terms.map((t) => t.id) } } });
  if (used) throw new Error("Học kỳ của năm học này đã có phân công giảng dạy, không thể xoá");
  await tx.scoreWeightConfig.deleteMany({ where: { academicTermId: { in: terms.map((t) => t.id) } } });
  await tx.academicTerm.deleteMany({ where: { academicYearId: id } });
  await tx.academicYear.delete({ where: { id } });
  if (year.schoolYear !== null) await tx.doanSchoolYear.deleteMany({ where: { startYear: year.schoolYear } });
}
