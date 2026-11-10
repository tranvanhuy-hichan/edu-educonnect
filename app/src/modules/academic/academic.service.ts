import { requireClassSubject } from "@/modules/curriculum/service";
import { isAdmin, isSystemAdmin, type SessionUser } from "@/lib/auth/session";
import * as academicRepository from "@/modules/academic/academic.repository";
import type {
  CreateAcademicYearInput,
  CreateClassSubjectAssignmentInput,
  CreateGradeLevelInput,
  CreateSchoolClassInput,
  CreateStudentClassEnrollmentInput,
  CreateTeacherInput,
} from "@/modules/academic/academic.schema";

export { ForbiddenError, ConflictError } from "@/shared/errors";
import { ForbiddenError, ConflictError } from "@/shared/errors";

/** Hiệu trưởng/Hiệu phó xem toàn bộ; các vai trò khác xem danh sách chung (read-only ở bước này). */
export function listAcademicYears() {
  return academicRepository.listAcademicYears();
}

export function createAcademicYear(
  user: SessionUser,
  input: CreateAcademicYearInput,
) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được tạo năm học");
  }
  return academicRepository.createAcademicYear(input);
}

export function listGradeLevels() {
  return academicRepository.listGradeLevels();
}

export function createGradeLevel(user: SessionUser, input: CreateGradeLevelInput) {
  if (!isAdmin(user) && !isSystemAdmin(user)) {
    throw new ForbiddenError("Chỉ Quản trị hệ thống/Hiệu trưởng/Hiệu phó được tạo khối");
  }
  return academicRepository.createGradeLevel(input);
}

export function listSchoolClasses(academicYearId?: string) {
  return academicRepository.listSchoolClasses(academicYearId);
}

export async function createSchoolClass(
  user: SessionUser,
  input: CreateSchoolClassInput,
) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được tạo lớp học");
  }

  const existing = await academicRepository.findSchoolClassByNameAndYear(
    input.className,
    input.academicYearId,
  );
  if (existing) {
    throw new ConflictError(
      `Lớp ${input.className} đã tồn tại trong năm học này`,
    );
  }

  return academicRepository.createSchoolClass(input);
}

/**
 * Mỗi học sinh chỉ được enroll 1 lớp/năm học (ràng buộc nghiệp vụ, không chỉ unique index DB,
 * để báo lỗi tiếng Việt rõ ràng trước khi chạm DB).
 */
export async function createStudentClassEnrollment(
  user: SessionUser,
  input: CreateStudentClassEnrollmentInput,
) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được xếp lớp học sinh");
  }

  const existing = await academicRepository.findEnrollmentByStudentAndYear(
    input.studentId,
    input.academicYearId,
  );
  if (existing) {
    throw new ConflictError("Học sinh này đã được xếp lớp trong năm học này");
  }

  return academicRepository.createStudentClassEnrollment(input);
}

export async function listStudentsInClass(
  user: SessionUser,
  schoolClassId: string,
) {
  const { canViewSchoolClassRoster } = await import("@/lib/auth/permission");
  const allowed = await canViewSchoolClassRoster(user, schoolClassId);
  if (!allowed) {
    throw new ForbiddenError("Không có quyền xem danh sách lớp này");
  }
  return academicRepository.listEnrollmentsByClass(schoolClassId);
}

/** 1 (lớp, môn, kỳ) chỉ có 1 giáo viên phụ trách tại một thời điểm. */
export async function createClassSubjectAssignment(
  user: SessionUser,
  input: CreateClassSubjectAssignmentInput,
) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được phân công giảng dạy");
  }

  await requireClassSubject(undefined, input.schoolClassId, input.subjectId, input.academicTermId);

  const existing = await academicRepository.findAssignmentByClassSubjectTerm(
    input.schoolClassId,
    input.subjectId,
    input.academicTermId,
  );
  if (existing) {
    throw new ConflictError(
      "Môn học này trong lớp và học kỳ đã có giáo viên phụ trách",
    );
  }

  return academicRepository.createClassSubjectAssignment(input);
}

export function listMyAssignments(user: SessionUser) {
  if (!user.teacherId) {
    throw new ForbiddenError("Chỉ giáo viên mới có phân công giảng dạy");
  }
  return academicRepository.listAssignmentsByTeacher(user.teacherId);
}

export function listAllTeachers(user: SessionUser) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được xem danh sách giáo viên");
  }
  return academicRepository.listAllTeachers();
}

export async function findTeacherById(user: SessionUser, id: string) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được xem chi tiết giáo viên");
  }
  const teacher = await academicRepository.findTeacherById(id);
  if (!teacher) {
    throw new ConflictError("Giáo viên không tồn tại");
  }
  return teacher;
}

/** Hiệu trưởng tạo tài khoản giáo viên mới (User + Teacher trong 1 transaction). */
export async function createTeacher(user: SessionUser, input: CreateTeacherInput) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được tạo tài khoản giáo viên");
  }

  const existing = await academicRepository.findUserByEmail(input.email);
  if (existing) {
    throw new ConflictError("Email này đã có tài khoản trong hệ thống");
  }

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(input.password, 10);

  return academicRepository.createTeacherWithUser(input, passwordHash);
}
