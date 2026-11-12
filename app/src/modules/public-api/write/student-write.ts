import { prisma } from "@/lib/prisma";
import type { Scope } from "@/modules/apikeys/api-key.scopes";
import { moveStudent } from "@/modules/academic/transfers";
import { createStudentWithAccount } from "@/server/students";
import { trashStudent } from "@/modules/trash/trash.repository";
import { ApiError } from "../public-api.service";
import { apiActor, audit, diff, fromDay, requireScopes, rule, toDay } from "./common";
import { recordChange } from "./changes";
import type { StudentCreate, StudentPatch, YouthPatch } from "./schemas";

type Key = { id: string; name: string };
type Cols = Record<string, unknown>;

/** Cột trong CSDL ↔ trường của API. Chỉ trả các cột người gọi thật sự gửi. */
function colsOf(input: StudentPatch | StudentCreate): Cols {
  const c: Cols = {};
  if ("fullName" in input && input.fullName !== undefined) c.fullName = input.fullName;
  if (input.dateOfBirth !== undefined) c.dob = input.dateOfBirth;
  if (input.gender !== undefined) c.gender = input.gender;
  const contact = input.contact ?? {};
  if (contact.phone !== undefined) c.phone = contact.phone;
  if (contact.email !== undefined) c.contactEmail = contact.email;
  if (contact.address !== undefined) c.address = contact.address;
  const g = input.guardian ?? {};
  if (g.name !== undefined) c.guardianName = g.name;
  if (g.relation !== undefined) c.guardianRelation = g.relation;
  if (g.phone !== undefined) c.guardianPhone = g.phone;
  if (g.email !== undefined) c.guardianEmail = g.email;
  const id = input.identity ?? {};
  if (id.idNumber !== undefined) c.idNumber = id.idNumber;
  if (id.birthPlace !== undefined) c.birthPlace = id.birthPlace;
  if (id.ethnicity !== undefined) c.ethnicity = id.ethnicity;
  return c;
}
export const toDb = (cols: Cols) => ({ ...cols, ...("dob" in cols ? { dob: fromDay(cols.dob as string | null) } : {}) });
export const snapshot = (student: Record<string, unknown>, keys: string[]): Cols => Object.fromEntries(keys.map((k) => [k, k === "dob" ? toDay(student.dob as Date | null) : (student[k] ?? null)]));

/** Quyền theo từng nhóm trường: gửi trường nhạy cảm mà khoá chưa được cấp thì từ chối cả yêu cầu. */
export function studentScopeNeeds(input: StudentPatch | StudentCreate) {
  const needs: { scope: Scope; why: string }[] = [];
  if (input.contact || input.guardian) needs.push({ scope: "students:contact", why: "ghi liên hệ/người giám hộ" });
  if (input.identity) needs.push({ scope: "students:identity", why: "ghi CCCD, nơi sinh, dân tộc" });
  return needs;
}

export async function createStudent(key: Key, scopes: ReadonlySet<Scope>, input: StudentCreate) {
  requireScopes(scopes, studentScopeNeeds(input));
  const actor = apiActor(key);
  const targetClass = input.classId ? await prisma.schoolClass.findUnique({ where: { id: input.classId }, include: { academicYear: true } }) : null;
  if (input.classId && !targetClass) throw new ApiError(404, "class_not_found", "Không tìm thấy lớp để xếp học sinh vào.");

  const created = await rule(() => createStudentWithAccount({ fullName: input.fullName, dob: fromDay(input.dateOfBirth), guardianName: input.guardian?.name ?? null, guardianPhone: input.guardian?.phone ?? null }));
  const student = await prisma.student.findUniqueOrThrow({ where: { code: created.code } });
  const rest = colsOf(input);
  for (const k of ["fullName", "dob", "guardianName", "guardianPhone"]) delete rest[k];
  if (Object.keys(rest).length) await prisma.student.update({ where: { id: student.id }, data: toDb(rest) });

  if (targetClass) {
    // Dùng đúng quy tắc chuyển/xếp lớp của nhà trường (sĩ số, năm học, kết quả đã duyệt). Lỗi thì huỷ luôn học sinh vừa tạo (vào Thùng rác).
    const y = targetClass.academicYear;
    const today = new Date(); const clamped = today < y.startDate ? y.startDate : today > y.endDate ? y.endDate : today;
    try {
      await rule(() => moveStudent(actor, { studentId: student.id, targetClassId: targetClass.id, effectiveDate: input.effectiveDate ?? clamped.toISOString().slice(0, 10), reason: `Thêm học sinh qua API (${key.name})`, decisionReference: "API" }));
    } catch (error) { await trashStudent(actor.email, student.id); throw error; }
  }
  await recordChange({ keyId: key.id, kind: "STUDENT_CREATE", entityType: "Student", entityId: student.id, label: input.fullName, after: { code: created.code, classId: input.classId ?? null }, meta: { code: created.code } });
  await audit(actor.email, "api_create_student", "Student", student.id);
  return student.id;
}

export async function updateStudent(key: Key, scopes: ReadonlySet<Scope>, id: string, patch: StudentPatch) {
  requireScopes(scopes, studentScopeNeeds(patch));
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw new ApiError(404, "not_found", "Không tìm thấy học sinh.");
  const cols = colsOf(patch);
  const keys = Object.keys(cols);
  const normalized: Cols = { ...cols };
  const d = diff(snapshot(student, keys), normalized);
  if (!d.changed) return { id, changed: false };
  await prisma.student.update({ where: { id }, data: toDb(Object.fromEntries(Object.keys(d.after).map((k) => [k, cols[k]]))) });
  await recordChange({ keyId: key.id, kind: "STUDENT_UPDATE", entityType: "Student", entityId: id, label: student.fullName, before: d.before, after: d.after });
  await audit(`api:${key.name}`, "api_update_student", "Student", id);
  return { id, changed: true };
}

export async function setStudentClass(key: Key, id: string, input: { classId: string; effectiveDate: string; reason: string; decisionReference: string }) {
  const [student, target] = await Promise.all([prisma.student.findUnique({ where: { id } }), prisma.schoolClass.findUnique({ where: { id: input.classId } })]);
  if (!student) throw new ApiError(404, "not_found", "Không tìm thấy học sinh.");
  if (!target) throw new ApiError(404, "class_not_found", "Không tìm thấy lớp đích.");
  const existing = await prisma.studentClassEnrollment.findUnique({ where: { studentId_academicYearId: { studentId: id, academicYearId: target.academicYearId } } });
  const result = (await rule(() => moveStudent(apiActor(key), { studentId: id, targetClassId: input.classId, effectiveDate: input.effectiveDate, reason: input.reason, decisionReference: input.decisionReference }))) as { id: string };
  await recordChange({ keyId: key.id, kind: "STUDENT_CLASS", entityType: "Student", entityId: id, label: student.fullName, before: { classId: existing?.schoolClassId ?? null }, after: { classId: input.classId }, meta: { academicYearId: target.academicYearId, enrollmentId: result.id } });
  await audit(`api:${key.name}`, "api_move_student", "Student", id);
  return { id };
}

export async function setYouth(key: Key, id: string, patch: YouthPatch) {
  const student = await prisma.student.findUnique({ where: { id }, include: { youth: true } });
  if (!student) throw new ApiError(404, "not_found", "Không tìm thấy học sinh.");
  const cur = student.youth;
  const snap = (y: typeof cur): Cols => ({ isMember: y?.isMember ?? false, joinedAt: toDay(y?.joinedAt), branch: y?.branch ?? null, position: y?.position ?? null, note: y?.note ?? null });
  const before = snap(cur);
  const wanted: Cols = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  if (cur && !diff(before, wanted).changed) return { id, changed: false };
  await prisma.studentYouth.upsert({
    where: { studentId: id },
    create: { studentId: id, isMember: wanted.isMember as boolean, joinedAt: fromDay(wanted.joinedAt as string | null), branch: wanted.branch as string | null, position: wanted.position as string | null, note: wanted.note as string | null, updatedBy: `api:${key.name}` },
    update: { isMember: wanted.isMember as boolean, joinedAt: fromDay(wanted.joinedAt as string | null), branch: wanted.branch as string | null, position: wanted.position as string | null, note: wanted.note as string | null, updatedBy: `api:${key.name}` },
  });
  await recordChange({ keyId: key.id, kind: "YOUTH_UPDATE", entityType: "Student", entityId: id, label: student.fullName, before: cur ? before : null, after: wanted });
  await audit(`api:${key.name}`, "api_update_youth", "Student", id);
  return { id, changed: true };
}
