import { prisma } from "@/lib/prisma";
export const classHomeroom = (id: string) => prisma.schoolClass.findUnique({ where: { id }, select: { homeroomTeacherId: true } });
export const assignmentTeacher = (id: string) => prisma.classSubjectAssignment.findUnique({ where: { id }, select: { teacherId: true } });
export const teacherClassAssignment = (schoolClassId: string, teacherId: string) => prisma.classSubjectAssignment.findFirst({ where: { schoolClassId, teacherId }, select: { id: true } });
export const studentHomeroomEnrollment = (studentId: string, teacherId: string) => prisma.studentClassEnrollment.findFirst({ where: { studentId, schoolClass: { homeroomTeacherId: teacherId } }, select: { id: true } });
