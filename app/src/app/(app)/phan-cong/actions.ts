"use server";
import { createClassSubjectAssignment } from "@/modules/academic/academic.service";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ADMIN_ROLES, MANAGER_ROLES, assertRole } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import { DAY_NAME } from "@/lib/catalog";
import { ensureTeacherRole } from "@/server/accounts";

/** Giáo viên đã có tiết trùng (cùng thứ + tiết, cùng học kỳ) với các tiết của phân công `assignmentId`? */
async function busyConflict(teacherId: string, termId: string, assignmentId: string | null, slots: { versionId: string; dayOfWeek: number; periodNo: number }[]) {
  if (!slots.length) return null;
  const hit = await db.timetableSlot.findFirst({
    where: { academicTermId: termId, assignment: { teacherId, ...(assignmentId ? { id: { not: assignmentId } } : {}) }, OR: slots.map((s) => ({ versionId: s.versionId, dayOfWeek: s.dayOfWeek, periodNo: s.periodNo })) },
    include: { schoolClass: true },
  });
  return hit ? `${DAY_NAME[hit.dayOfWeek]} tiết ${hit.periodNo} đã dạy lớp ${hit.schoolClass.className}` : null;
}

export const createAssignment = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const schoolClassId = str(fd, "classId"), subjectId = str(fd, "subjectId"), teacherId = str(fd, "teacherId"), academicTermId = str(fd, "termId");
  if (!schoolClassId || !subjectId || !teacherId || !academicTermId) throw new Error("Chọn đủ lớp, môn, giáo viên và học kỳ");
  const cls = await db.schoolClass.findUniqueOrThrow({ where: { id: schoolClassId } });
  const term = await db.academicTerm.findUniqueOrThrow({ where: { id: academicTermId } });
  if (term.academicYearId !== cls.academicYearId) throw new Error("Học kỳ không thuộc năm học của lớp này");
  if (await db.classSubjectAssignment.findUnique({ where: { schoolClassId_subjectId_academicTermId: { schoolClassId, subjectId, academicTermId } } })) throw new Error("Lớp đã có giáo viên dạy môn này trong học kỳ — dùng 'Đổi giáo viên'");
  const a = await createClassSubjectAssignment(me, { schoolClassId, subjectId, teacherId, academicTermId });
  await ensureTeacherRole(teacherId, "SUBJECT_TEACHER");
  await audit(me.email, "create_assignment", "ClassSubjectAssignment", a.id);
  revalidatePath("/phan-cong"); revalidatePath(`/lop-hoc/${schoolClassId}?tab=assignments`); revalidatePath("/lich-hoc/tu-dong");
  return "Đã phân công giảng dạy";
});

export const changeTeacher = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const id = str(fd, "id"), teacherId = str(fd, "teacherId");
  if (!teacherId) throw new Error("Chọn giáo viên");
  const a = await db.classSubjectAssignment.findUniqueOrThrow({ where: { id }, include: { timetableSlots: true } });
  if (a.teacherId === teacherId) throw new Error("Giáo viên này đang được phân công");
  const clash = await busyConflict(teacherId, a.academicTermId, id, a.timetableSlots);
  if (clash) throw new Error(`Giáo viên bị trùng lịch: ${clash}`);
  await db.classSubjectAssignment.update({ where: { id }, data: { teacherId } });
  await ensureTeacherRole(teacherId, "SUBJECT_TEACHER");
  await audit(me.email, `change_teacher:${a.teacherId}->${teacherId}`, "ClassSubjectAssignment", id);
  revalidatePath("/phan-cong"); revalidatePath(`/lop-hoc/${a.schoolClassId}`);
  return "Đã đổi giáo viên";
});

export const deleteAssignment = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  const a = await db.classSubjectAssignment.findUniqueOrThrow({ where: { id }, include: { _count: { select: { timetableSlots: true, scoreEntries: true, lessonPosts: true, lessonPlans: true } } } });
  const n = a._count;
  if (n.timetableSlots || n.scoreEntries || n.lessonPosts || n.lessonPlans) throw new Error("Phân công đã có thời khóa biểu/điểm/bài học, không xoá được — hãy 'Đổi giáo viên'");
  await db.classSubjectAssignment.delete({ where: { id } });
  await audit(me.email, "delete_assignment", "ClassSubjectAssignment", id);
  revalidatePath("/phan-cong");
});
