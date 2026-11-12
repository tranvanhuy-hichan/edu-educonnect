import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Scope } from "@/modules/apikeys/api-key.scopes";
import * as repo from "./public-api.repository";

export class ApiError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 413 | 415 | 422, public code: string, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

/** Phân trang chung: ?page=1&pageSize=50 (tối đa 200). */
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
const text = z.string().trim().min(1).max(100).optional();
const statusSchema = z.enum(["active", "locked", "all"]).default("active");

export type Page = { page: number; pageSize: number };
export const pageMeta = (p: Page, total: number) => ({ page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) });
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Năm học theo ?year= (mã hoặc tên như 2026-2027); mặc định năm học hiện hành. */
export async function resolveYear(param?: string) {
  const year = param ? await repo.findYear(param) : await repo.currentYear();
  if (!year) throw new ApiError(404, "year_not_found", param ? `Không có năm học "${param}".` : "Chưa có năm học hiện hành.");
  return year;
}
const yearDto = (y: { id: string; yearName: string }) => ({ id: y.id, name: y.yearName });

// ───────────── DTO ─────────────
type EnrollmentRow = Awaited<ReturnType<typeof repo.findStudentEnrollment>>;
type StudentRow = NonNullable<Awaited<ReturnType<typeof repo.findStudentOnly>>>;

/** Học sinh: trường cơ bản luôn có; nhóm liên hệ/định danh chỉ có khi khoá được cấp quyền tương ứng. */
export function studentDto(student: StudentRow, enrollment: EnrollmentRow | null, scopes: ReadonlySet<Scope>) {
  const base = {
    id: student.id, code: student.code, fullName: student.fullName, gender: student.gender, dateOfBirth: day(student.dob),
    status: student.user.isActive ? "active" : "locked",
    class: enrollment ? { id: enrollment.schoolClass.id, name: enrollment.schoolClass.className } : null,
    grade: enrollment ? { id: enrollment.schoolClass.gradeLevel.id, name: enrollment.schoolClass.gradeLevel.gradeName } : null,
    academicYear: enrollment ? yearDto(enrollment.schoolClass.academicYear) : null,
  };
  return {
    ...base,
    ...(scopes.has("students:contact") ? { contact: { phone: student.phone, email: student.contactEmail, address: student.address }, guardian: { name: student.guardianName, relation: student.guardianRelation, phone: student.guardianPhone, email: student.guardianEmail } } : {}),
    ...(scopes.has("youth:read") ? { youth: { isMember: student.youth?.isMember ?? false, joinedAt: day(student.youth?.joinedAt ?? null), branch: student.youth?.branch ?? null, position: student.youth?.position ?? null, note: student.youth?.note ?? null } } : {}),
    ...(scopes.has("students:identity") ? { identity: { idNumber: student.idNumber, birthPlace: student.birthPlace, ethnicity: student.ethnicity } } : {}),
  };
}

type TeacherRow = NonNullable<Awaited<ReturnType<typeof repo.findTeacher>>>;
export function teacherDto(t: TeacherRow, scopes: ReadonlySet<Scope>) {
  return {
    id: t.id, code: t.code, fullName: t.fullName, gender: t.gender, status: t.user.isActive ? "active" : "locked",
    subjects: t.subjects.map((s) => ({ id: s.subject.id, name: s.subject.subjectName })),
    homeroomClasses: t.homeroomClasses.map((c) => ({ id: c.id, name: c.className })),
    ...(scopes.has("teachers:contact") ? { contact: { phone: t.phone, email: t.contactEmail } } : {}),
  };
}

type ClassRow = NonNullable<Awaited<ReturnType<typeof repo.findClass>>>;
export const classDto = (c: ClassRow) => ({
  id: c.id, name: c.className, grade: { id: c.gradeLevel.id, name: c.gradeLevel.gradeName, order: c.gradeLevel.sortOrder },
  academicYear: yearDto(c.academicYear), shift: c.shift,
  homeroomTeacher: c.homeroomTeacher ? { id: c.homeroomTeacher.id, code: c.homeroomTeacher.code, fullName: c.homeroomTeacher.fullName } : null,
  studentCount: c._count.enrollments,
});

// ───────────── Truy vấn theo endpoint ─────────────
export async function rooms() {
  return (await repo.listRooms()).map((r) => ({ id: r.id, name: r.roomName, capacity: r.capacity }));
}
export async function subjects() {
  return (await repo.listSubjects()).map((s) => ({ id: s.id, name: s.subjectName, assessmentType: s.assessmentType }));
}

export async function years() {
  const [list, current] = await Promise.all([repo.listYears(), repo.currentYear()]);
  return list.map((y) => ({ id: y.id, name: y.yearName, startDate: day(y.startDate), endDate: day(y.endDate), current: y.id === current?.id }));
}

export async function grades(query: URLSearchParams) {
  const q = z.object({ year: text }).parse(Object.fromEntries(query));
  const year = await resolveYear(q.year);
  return { year, data: (await repo.gradesWithCounts(year.id)).map((g) => ({ id: g.id, name: g.gradeName, order: g.sortOrder, classCount: g.classCount, studentCount: g.studentCount })) };
}

export async function classes(query: URLSearchParams) {
  const q = pageSchema.extend({ year: text, grade: text, q: text }).parse(Object.fromEntries(query));
  const year = await resolveYear(q.year);
  const where: Prisma.SchoolClassWhereInput = { academicYearId: year.id, ...(q.grade ? { gradeLevelId: q.grade } : {}), ...(q.q ? { className: { contains: q.q, mode: "insensitive" } } : {}) };
  const [total, rows] = await repo.listClasses(where, (q.page - 1) * q.pageSize, q.pageSize);
  return { data: rows.map(classDto), meta: pageMeta(q, total) };
}

export async function classById(id: string) {
  const c = await repo.findClass(id);
  if (!c) throw new ApiError(404, "not_found", "Không tìm thấy lớp.");
  return classDto(c);
}

async function studentList(base: Prisma.StudentClassEnrollmentWhereInput, query: URLSearchParams, scopes: ReadonlySet<Scope>, extra: { classId?: string } = {}) {
  const q = pageSchema.extend({ year: text, grade: text, class: text, q: text, status: statusSchema }).parse(Object.fromEntries(query));
  const year = await resolveYear(q.year);
  const classId = extra.classId ?? q.class;
  const where: Prisma.StudentClassEnrollmentWhereInput = {
    ...base, academicYearId: year.id, ...(classId ? { schoolClassId: classId } : {}), ...(q.grade ? { schoolClass: { gradeLevelId: q.grade } } : {}),
    student: {
      ...(q.status === "all" ? {} : { user: { isActive: q.status === "active" } }),
      ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: "insensitive" } }, { code: { contains: q.q, mode: "insensitive" } }] } : {}),
    },
  };
  const [total, rows] = await repo.listEnrollments(where, (q.page - 1) * q.pageSize, q.pageSize);
  return { data: rows.map((e) => studentDto(e.student, e, scopes)), meta: pageMeta(q, total) };
}
export const students = (query: URLSearchParams, scopes: ReadonlySet<Scope>) => studentList({}, query, scopes);
export async function classStudents(classId: string, query: URLSearchParams, scopes: ReadonlySet<Scope>) {
  if (!(await repo.findClass(classId))) throw new ApiError(404, "not_found", "Không tìm thấy lớp.");
  return studentList({}, query, scopes, { classId });
}

export async function studentById(id: string, query: URLSearchParams, scopes: ReadonlySet<Scope>) {
  const q = z.object({ year: text }).parse(Object.fromEntries(query));
  const [year, student] = await Promise.all([resolveYear(q.year), repo.findStudentOnly(id)]);
  if (!student) throw new ApiError(404, "not_found", "Không tìm thấy học sinh.");
  return studentDto(student, await repo.findStudentEnrollment(id, year.id), scopes);
}

export async function teachers(query: URLSearchParams, scopes: ReadonlySet<Scope>) {
  const q = pageSchema.extend({ year: text, q: text, subject: text, homeroom: z.enum(["true", "false"]).optional(), status: statusSchema }).parse(Object.fromEntries(query));
  const year = await resolveYear(q.year);
  const where: Prisma.TeacherWhereInput = {
    ...(q.status === "all" ? {} : { user: { isActive: q.status === "active" } }),
    ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: "insensitive" } }, { code: { contains: q.q, mode: "insensitive" } }] } : {}),
    ...(q.subject ? { subjects: { some: { subjectId: q.subject } } } : {}),
    ...(q.homeroom === "true" ? { homeroomClasses: { some: { academicYearId: year.id } } } : q.homeroom === "false" ? { homeroomClasses: { none: { academicYearId: year.id } } } : {}),
  };
  const [total, rows] = await repo.listTeachers(where, year.id, (q.page - 1) * q.pageSize, q.pageSize);
  return { data: rows.map((t) => teacherDto(t, scopes)), meta: pageMeta(q, total) };
}
export async function teacherById(id: string, query: URLSearchParams, scopes: ReadonlySet<Scope>) {
  const q = z.object({ year: text }).parse(Object.fromEntries(query));
  const year = await resolveYear(q.year);
  const t = await repo.findTeacher(id, year.id);
  if (!t) throw new ApiError(404, "not_found", "Không tìm thấy giáo viên.");
  return teacherDto(t, scopes);
}

type YouthRow = { isMember: boolean; joinedAt: Date | null; branch: string | null; position: string | null; note: string | null; updatedAt: Date };
const youthDto = (studentId: string, y: YouthRow | null) => ({ studentId, isMember: y?.isMember ?? false, joinedAt: day(y?.joinedAt ?? null), branch: y?.branch ?? null, position: y?.position ?? null, note: y?.note ?? null, updatedAt: y ? y.updatedAt.toISOString() : null });
export async function youthOf(studentId: string) {
  const s = await repo.findYouth(studentId);
  if (!s) throw new ApiError(404, "not_found", "Không tìm thấy học sinh.");
  return youthDto(studentId, s.youth);
}
export async function youthList(query: URLSearchParams) {
  const q = pageSchema.parse(Object.fromEntries(query));
  const [total, rows] = await repo.listYouth((q.page - 1) * q.pageSize, q.pageSize);
  return { data: rows.map((y) => youthDto(y.studentId, y)), meta: pageMeta(q, total) };
}
