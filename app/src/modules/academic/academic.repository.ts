import { createSharedAccount, setSharedPassword, credentialOfUser } from "@/modules/account/account.repository";
import { createClassWithSubjects } from "@/modules/curriculum/service";
import { prisma } from "@/lib/prisma";
import type {
  CreateAcademicYearInput,
  CreateClassSubjectAssignmentInput,
  CreateGradeLevelInput,
  CreateSchoolClassInput,
  CreateStudentClassEnrollmentInput,
  CreateTeacherInput,
} from "@/modules/academic/academic.schema";

export function listAcademicYears() {
  return prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
}

export function createAcademicYear(input: CreateAcademicYearInput) {
  return prisma.academicYear.create({ data: input });
}

export function listGradeLevels() {
  return prisma.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } });
}

export function createGradeLevel(input: CreateGradeLevelInput) {
  return prisma.gradeLevel.create({ data: input });
}

export function listSchoolClasses(academicYearId?: string) {
  return prisma.schoolClass.findMany({
    where: academicYearId ? { academicYearId } : undefined,
    include: { gradeLevel: true, homeroomTeacher: true },
    orderBy: { className: "asc" },
  });
}

export function findSchoolClassByNameAndYear(
  className: string,
  academicYearId: string,
) {
  return prisma.schoolClass.findUnique({
    where: { className_academicYearId: { className, academicYearId } },
  });
}

export function createSchoolClass(input: CreateSchoolClassInput) {
  const { subjectIds, ...data } = input;
  return createClassWithSubjects(data, subjectIds);
}

export function findEnrollmentByStudentAndYear(
  studentId: string,
  academicYearId: string,
) {
  return prisma.studentClassEnrollment.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
  });
}

export function createStudentClassEnrollment(
  input: CreateStudentClassEnrollmentInput,
) {
  return prisma.studentClassEnrollment.create({ data: input });
}

export function listEnrollmentsByClass(schoolClassId: string) {
  return prisma.studentClassEnrollment.findMany({
    where: { schoolClassId },
    include: { student: true },
  });
}

export function findAssignmentByClassSubjectTerm(
  schoolClassId: string,
  subjectId: string,
  academicTermId: string,
) {
  return prisma.classSubjectAssignment.findUnique({
    where: {
      schoolClassId_subjectId_academicTermId: {
        schoolClassId,
        subjectId,
        academicTermId,
      },
    },
  });
}

export function createClassSubjectAssignment(
  input: CreateClassSubjectAssignmentInput,
) {
  return prisma.classSubjectAssignment.create({ data: input });
}

export function listAssignmentsByTeacher(teacherId: string) {
  return prisma.classSubjectAssignment.findMany({
    where: { teacherId },
    include: { schoolClass: true, subject: true, academicTerm: true },
  });
}

export function listAllTeachers() {
  return prisma.teacher.findMany({
    include: { user: { select: { email: true, roles: true } } },
    orderBy: { fullName: "asc" },
  });
}

export function findTeacherById(id: string) {
  return prisma.teacher.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, roles: true } },
      homeroomClasses: { include: { gradeLevel: true } },
      assignments: { include: { schoolClass: true, subject: true, academicTerm: true } },
    },
  });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function createTeacherWithUser(
  input: CreateTeacherInput,
  passwordHash: string,
) {
  return prisma.$transaction(async (tx) => {
    const account = await createSharedAccount(tx, { username: input.email, passwordHash, fullName: input.fullName });
    const user = await tx.user.create({
      data: { accountId: account.id, email: input.email, roles: input.roles },
    });
    return tx.teacher.create({
      data: { userId: user.id, fullName: input.fullName, phone: input.phone },
      include: { user: { select: { email: true, roles: true } } },
    });
  });
}

export async function teacherHasSubject(teacherId: string, subjectId: string) {
  return (await prisma.teacherSubject.count({ where: { teacherId, subjectId } })) > 0;
}
