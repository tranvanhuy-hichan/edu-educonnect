import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { genPassword, genTeacherCode } from "@/lib/password";
import type { Scope } from "@/modules/apikeys/api-key.scopes";
import { ApiError } from "../public-api.service";
import { audit, diff, fromDay, requireScopes, toDay } from "./common";
import { recordChange } from "./changes";
import type { TeacherCreate, TeacherPatch } from "./schemas";

type Key = { id: string; name: string };
type Cols = Record<string, unknown>;

function colsOf(i: TeacherCreate | TeacherPatch): Cols {
  const c: Cols = {};
  if (i.fullName !== undefined) c.fullName = i.fullName;
  if (i.gender !== undefined) c.gender = i.gender;
  if (i.dateOfBirth !== undefined) c.dob = i.dateOfBirth;
  if (i.degree !== undefined) c.degree = i.degree;
  if (i.startDate !== undefined) c.startDate = i.startDate;
  const contact = i.contact ?? {};
  if (contact.phone !== undefined) c.phone = contact.phone;
  if (contact.email !== undefined) c.contactEmail = contact.email;
  if (contact.address !== undefined) c.address = contact.address;
  return c;
}
export const toDb = (c: Cols) => ({ ...c, ...("dob" in c ? { dob: fromDay(c.dob as string | null) } : {}), ...("startDate" in c ? { startDate: fromDay(c.startDate as string | null) } : {}) });
export const snap = (t: Record<string, unknown>, keys: string[]): Cols => Object.fromEntries(keys.map((k) => [k, k === "dob" || k === "startDate" ? toDay(t[k] as Date | null) : (t[k] ?? null)]));
const needs = (i: TeacherCreate | TeacherPatch) => (i.contact ? [{ scope: "teachers:contact" as Scope, why: "ghi số điện thoại, email, địa chỉ" }] : []);

async function checkSubjects(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length && (await prisma.subject.count({ where: { id: { in: unique } } })) !== unique.length) throw new ApiError(404, "subject_not_found", "Có mã môn học không tồn tại.");
  return unique;
}

export async function createTeacher(key: Key, scopes: ReadonlySet<Scope>, input: TeacherCreate) {
  requireScopes(scopes, needs(input));
  const subjectIds = await checkSubjects(input.subjectIds ?? []);
  if (await prisma.user.findUnique({ where: { email: input.loginEmail }, select: { id: true } })) throw new ApiError(409, "email_taken", "Email đăng nhập này đã có tài khoản.");
  let code = genTeacherCode();
  while (await prisma.teacher.findUnique({ where: { code } })) code = genTeacherCode();
  // Tài khoản được tạo với mật khẩu ngẫu nhiên và BẮT ĐỔI khi đăng nhập; mật khẩu không trả về cho hệ thống ngoài (quản trị cấp lại ở mục Tài khoản).
  const cols = toDb(colsOf(input));
  const user = await prisma.user.create({
    data: { email: input.loginEmail, passwordHash: await bcrypt.hash(genPassword(), 10), roles: ["SUBJECT_TEACHER"], mustChangePwd: true, teacher: { create: { code, ...(cols as { fullName: string }), subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) } } } },
    include: { teacher: true },
  });
  const teacher = user.teacher!;
  await recordChange({ keyId: key.id, kind: "TEACHER_CREATE", entityType: "Teacher", entityId: teacher.id, label: input.fullName, after: { code, loginEmail: input.loginEmail, subjectIds }, meta: { userId: user.id } });
  await audit(`api:${key.name}`, "api_create_teacher", "Teacher", teacher.id);
  return teacher.id;
}

export async function updateTeacher(key: Key, scopes: ReadonlySet<Scope>, id: string, patch: TeacherPatch) {
  requireScopes(scopes, needs(patch));
  const teacher = await prisma.teacher.findUnique({ where: { id }, include: { subjects: { select: { subjectId: true } } } });
  if (!teacher) throw new ApiError(404, "not_found", "Không tìm thấy giáo viên.");
  const cols = colsOf(patch);
  const before = snap(teacher, Object.keys(cols));
  const after: Cols = { ...cols };
  let subjectIds: string[] | null = null;
  if (patch.subjectIds) { subjectIds = await checkSubjects(patch.subjectIds); before.subjectIds = teacher.subjects.map((s) => s.subjectId).sort(); after.subjectIds = [...subjectIds].sort(); }
  const d = diff(before, after);
  if (!d.changed) return { id, changed: false };
  const { subjectIds: _drop, ...dbCols } = Object.fromEntries(Object.keys(d.after).map((k) => [k, k === "subjectIds" ? subjectIds : cols[k]]));
  void _drop;
  await prisma.$transaction(async (tx) => {
    if (Object.keys(dbCols).length) await tx.teacher.update({ where: { id }, data: toDb(dbCols) });
    if (subjectIds && "subjectIds" in d.after) { await tx.teacherSubject.deleteMany({ where: { teacherId: id } }); await tx.teacherSubject.createMany({ data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })) }); }
  });
  await recordChange({ keyId: key.id, kind: "TEACHER_UPDATE", entityType: "Teacher", entityId: id, label: teacher.fullName, before: d.before, after: d.after });
  await audit(`api:${key.name}`, "api_update_teacher", "Teacher", id);
  return { id, changed: true };
}
