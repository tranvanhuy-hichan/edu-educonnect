import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const findFile = (id: string) => prisma.storedFile.findUnique({ where: { id } });
export const findFiles = (ids: string[]) => prisma.storedFile.findMany({ where: { id: { in: ids } } });
export const createFile = (data: Prisma.StoredFileUncheckedCreateInput) => prisma.storedFile.create({ data });
export const findAssignment = (id: string) => prisma.classSubjectAssignment.findUnique({ where: { id }, include: { academicTerm: true } });
export const findExercise = (id: string) => prisma.exercise.findUnique({ where: { id }, include: { lessonPost: { include: { assignment: { include: { academicTerm: true } } } } } });
export const findEnrollment = (studentId: string, academicYearId: string) => prisma.studentClassEnrollment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId } } });
export const findSubmission = (exerciseId: string, studentId: string) => prisma.assignmentSubmission.findUnique({ where: { exerciseId_studentId: { exerciseId, studentId } } });
export async function isFilePublished(assignmentId: string, purpose: string, path: string) {
  if (purpose === "LESSON_PLAN") return await prisma.lessonPlan.count({ where: { assignmentId, attachment: path } }) > 0;
  if (purpose === "LESSON_POST") return await prisma.lessonPost.count({ where: { assignmentId, attachments: { array_contains: [path] } } }) > 0;
  return await prisma.exercise.count({ where: { lessonPost: { assignmentId }, attachments: { array_contains: [path] } } }) > 0;
}
