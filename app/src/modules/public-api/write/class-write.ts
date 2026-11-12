import { prisma } from "@/lib/prisma";
import { assertClassRules } from "@/modules/curriculum/class-rules";
import { createClassWithSubjects } from "@/modules/curriculum/service";
import { ensureTeacherRole } from "@/server/accounts";
import { ApiError, resolveYear } from "../public-api.service";
import { audit, diff, rule } from "./common";
import { recordChange } from "./changes";
import type { ClassCreate, ClassPatch } from "./schemas";

type Key = { id: string; name: string };

async function checkTeacher(id: string | null | undefined) {
  if (id && !(await prisma.teacher.findUnique({ where: { id }, select: { id: true } }))) throw new ApiError(404, "teacher_not_found", "Không tìm thấy giáo viên chủ nhiệm.");
}

export async function createClass(key: Key, input: ClassCreate) {
  const year = await resolveYear(input.year);
  if (!(await prisma.gradeLevel.findUnique({ where: { id: input.gradeId }, select: { id: true } }))) throw new ApiError(404, "grade_not_found", "Không tìm thấy khối.");
  await checkTeacher(input.homeroomTeacherId);
  const shift = input.shift ?? "MORNING";
  await rule(() => assertClassRules({ className: input.name, academicYearId: year.id, roomId: input.roomId, shift }));
  const cls = await rule(() => createClassWithSubjects({ className: input.name, gradeLevelId: input.gradeId, academicYearId: year.id, roomId: input.roomId, shift, homeroomTeacherId: input.homeroomTeacherId ?? null }, input.subjectIds));
  if (input.homeroomTeacherId) await ensureTeacherRole(input.homeroomTeacherId, "HOMEROOM_TEACHER");
  await recordChange({ keyId: key.id, kind: "CLASS_CREATE", entityType: "SchoolClass", entityId: cls.id, label: `Lớp ${input.name}`, after: { name: input.name, academicYearId: year.id, gradeId: input.gradeId } });
  await audit(`api:${key.name}`, "api_create_class", "SchoolClass", cls.id);
  return cls.id;
}

export async function updateClass(key: Key, id: string, patch: ClassPatch) {
  const cls = await prisma.schoolClass.findUnique({ where: { id } });
  if (!cls) throw new ApiError(404, "not_found", "Không tìm thấy lớp.");
  if (patch.homeroomTeacherId !== undefined) await checkTeacher(patch.homeroomTeacherId);
  const cur = { className: cls.className, roomId: cls.roomId, shift: cls.shift, homeroomTeacherId: cls.homeroomTeacherId };
  const want = { className: patch.name ?? cur.className, roomId: patch.roomId ?? cur.roomId, shift: patch.shift ?? cur.shift, homeroomTeacherId: patch.homeroomTeacherId === undefined ? cur.homeroomTeacherId : patch.homeroomTeacherId };
  const d = diff(cur, want);
  if (!d.changed) return { id, changed: false };
  if (!want.roomId) throw new ApiError(400, "invalid_parameters", "Lớp phải có phòng học cố định (roomId).");
  await rule(() => assertClassRules({ className: want.className, academicYearId: cls.academicYearId, roomId: want.roomId as string, shift: want.shift }, id));
  await prisma.schoolClass.update({ where: { id }, data: want });
  if (want.homeroomTeacherId && "homeroomTeacherId" in d.after) await ensureTeacherRole(want.homeroomTeacherId, "HOMEROOM_TEACHER");
  await recordChange({ keyId: key.id, kind: "CLASS_UPDATE", entityType: "SchoolClass", entityId: id, label: `Lớp ${cls.className}`, before: d.before, after: d.after });
  await audit(`api:${key.name}`, "api_update_class", "SchoolClass", id);
  return { id, changed: true };
}
