import { z } from "zod";

export const createAcademicYearSchema = z.object({
  yearName: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

export const createGradeLevelSchema = z.object({
  gradeName: z.string().min(1),
  sortOrder: z.number().int(),
});
export type CreateGradeLevelInput = z.infer<typeof createGradeLevelSchema>;

export const createSchoolClassSchema = z.object({
  subjectIds: z.array(z.string().min(1)).min(1),
  roomId: z.string().min(1),
  className: z.string().min(1),
  gradeLevelId: z.string().min(1),
  academicYearId: z.string().min(1),
  homeroomTeacherId: z.string().min(1).optional(),
});
export type CreateSchoolClassInput = z.infer<typeof createSchoolClassSchema>;

export const createStudentClassEnrollmentSchema = z.object({
  studentId: z.string().min(1),
  schoolClassId: z.string().min(1),
  academicYearId: z.string().min(1),
});
export type CreateStudentClassEnrollmentInput = z.infer<
  typeof createStudentClassEnrollmentSchema
>;

export const createTeacherSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  roles: z
    .array(z.enum(["PRINCIPAL", "VICE_PRINCIPAL", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN"]))
    .min(1),
});
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

export const createClassSubjectAssignmentSchema = z.object({
  schoolClassId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
  academicTermId: z.string().min(1),
});
export type CreateClassSubjectAssignmentInput = z.infer<
  typeof createClassSubjectAssignmentSchema
>;
