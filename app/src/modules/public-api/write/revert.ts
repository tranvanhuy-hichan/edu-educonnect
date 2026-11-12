import { prisma } from "@/lib/prisma";
import { isSystemAdmin, type SessionUser } from "@/lib/auth/session";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import { moveStudent } from "@/modules/academic/transfers";
import { assertClassRules } from "@/modules/curriculum/class-rules";
import { trashClass, trashStudent } from "@/modules/trash/trash.repository";
import { findChange, markReverted } from "./changes";
import { toDb as studentToDb, snapshot as studentSnap } from "./student-write";
import { toDb as teacherToDb, snap as teacherSnap } from "./teacher-write";
import { audit, fromDay, toDay } from "./common";

type Json = Record<string, unknown>;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const changedSince = (current: Json, after: Json) => Object.keys(after).filter((k) => !same(current[k], after[k]));
const stale = (fields: string[]) => new ConflictError(`Không thể hoàn tác tự động vì dữ liệu đã được sửa sau đó (${fields.join(", ")}). Hãy chỉnh tay nếu cần.`);

/**
 * Hoàn tác một thay đổi do API thực hiện. An toàn trước hết: chỉ hoàn tác khi dữ liệu HIỆN TẠI vẫn đúng như API đã ghi
 * (chưa ai sửa tiếp) và bản ghi tạo mới chưa phát sinh dữ liệu khác; ngược lại từ chối kèm lý do.
 * Học sinh/lớp tạo nhầm được đưa vào Thùng rác (khôi phục được), không xoá hẳn.
 */
export async function revertApiChange(admin: SessionUser, id: string) {
  if (!isSystemAdmin(admin)) throw new ForbiddenError("Chỉ Quản trị hệ thống được hoàn tác thay đổi của API");
  const change = await findChange(id);
  if (!change) throw new ConflictError("Không tìm thấy thay đổi");
  if (change.revertedAt) throw new ConflictError("Thay đổi này đã được hoàn tác");
  const before = (change.before ?? null) as Json | null, after = (change.after ?? {}) as Json, meta = (change.meta ?? {}) as Json;
  const eid = change.entityId;

  switch (change.kind) {
    case "STUDENT_UPDATE": {
      const s = await prisma.student.findUnique({ where: { id: eid } });
      if (!s) throw new ConflictError("Học sinh không còn tồn tại");
      const keys = Object.keys(after);
      const stale1 = changedSince(studentSnap(s, keys), after);
      if (stale1.length) throw stale(stale1);
      await prisma.student.update({ where: { id: eid }, data: studentToDb(before ?? {}) });
      break;
    }
    case "TEACHER_UPDATE": {
      const t = await prisma.teacher.findUnique({ where: { id: eid }, include: { subjects: { select: { subjectId: true } } } });
      if (!t) throw new ConflictError("Giáo viên không còn tồn tại");
      const keys = Object.keys(after).filter((k) => k !== "subjectIds");
      const cur: Json = { ...teacherSnap(t, keys), subjectIds: t.subjects.map((x) => x.subjectId).sort() };
      const stale1 = changedSince(cur, after);
      if (stale1.length) throw stale(stale1);
      const { subjectIds, ...cols } = (before ?? {}) as Json;
      await prisma.$transaction(async (tx) => {
        if (Object.keys(cols).length) await tx.teacher.update({ where: { id: eid }, data: teacherToDb(cols) });
        if (Array.isArray(subjectIds)) { await tx.teacherSubject.deleteMany({ where: { teacherId: eid } }); await tx.teacherSubject.createMany({ data: (subjectIds as string[]).map((subjectId) => ({ teacherId: eid, subjectId })) }); }
      });
      break;
    }
    case "CLASS_UPDATE": {
      const c = await prisma.schoolClass.findUnique({ where: { id: eid } });
      if (!c) throw new ConflictError("Lớp không còn tồn tại");
      const stale1 = changedSince({ className: c.className, roomId: c.roomId, shift: c.shift, homeroomTeacherId: c.homeroomTeacherId }, after);
      if (stale1.length) throw stale(stale1);
      const want = { className: (before?.className as string) ?? c.className, roomId: (before?.roomId as string) ?? c.roomId, shift: ((before?.shift as "MORNING" | "AFTERNOON") ?? c.shift) };
      if (want.roomId) await assertClassRules({ className: want.className, academicYearId: c.academicYearId, roomId: want.roomId, shift: want.shift }, eid).catch((e: Error) => { throw new ConflictError(`Không hoàn tác được: ${e.message}`); });
      await prisma.schoolClass.update({ where: { id: eid }, data: before ?? {} });
      break;
    }
    case "YOUTH_UPDATE": {
      const y = await prisma.studentYouth.findUnique({ where: { studentId: eid } });
      if (!y) throw new ConflictError("Thông tin Đoàn không còn tồn tại");
      const cur: Json = { isMember: y.isMember, joinedAt: toDay(y.joinedAt), branch: y.branch, position: y.position, note: y.note };
      const stale1 = changedSince(cur, after);
      if (stale1.length) throw stale(stale1);
      if (!before) await prisma.studentYouth.delete({ where: { studentId: eid } });
      else await prisma.studentYouth.update({ where: { studentId: eid }, data: { isMember: before.isMember as boolean, joinedAt: fromDay(before.joinedAt as string | null), branch: before.branch as string | null, position: before.position as string | null, note: before.note as string | null, updatedBy: `hoàn tác:${admin.email}` } });
      break;
    }
    case "STUDENT_CREATE": {
      if (!(await prisma.student.findUnique({ where: { id: eid }, select: { id: true } }))) throw new ConflictError("Học sinh không còn tồn tại");
      const [scores, loans, subs, seats] = await Promise.all([prisma.scoreEntry.count({ where: { studentId: eid } }), prisma.libraryLoan.count({ where: { studentId: eid } }), prisma.assignmentSubmission.count({ where: { studentId: eid } }), prisma.examSeat.count({ where: { studentId: eid } })]);
      if (scores || loans || subs || seats) throw new ConflictError("Học sinh này đã phát sinh điểm, mượn sách, bài nộp hoặc lịch thi nên không hoàn tác việc tạo được. Hãy khoá tài khoản thay vì xoá.");
      await trashStudent(admin.email, eid);
      break;
    }
    case "TEACHER_CREATE": {
      const t = await prisma.teacher.findUnique({ where: { id: eid } });
      if (!t) throw new ConflictError("Giáo viên không còn tồn tại");
      const used = (await Promise.all([prisma.classSubjectAssignment.count({ where: { teacherId: eid } }), prisma.question.count({ where: { teacherId: eid } }), prisma.libraryLesson.count({ where: { teacherId: eid } }), prisma.examInvigilation.count({ where: { teacherId: eid } }), prisma.importJob.count({ where: { teacherId: eid } }), prisma.schoolClass.count({ where: { homeroomTeacherId: eid } })])).some((n) => n > 0);
      if (used) throw new ConflictError("Giáo viên này đã được phân công hoặc có dữ liệu liên quan nên không hoàn tác việc tạo được. Hãy khoá tài khoản.");
      await prisma.$transaction([prisma.teacher.delete({ where: { id: eid } }), prisma.user.delete({ where: { id: t.userId } })]);
      break;
    }
    case "CLASS_CREATE": {
      if (!(await prisma.schoolClass.findUnique({ where: { id: eid }, select: { id: true } }))) throw new ConflictError("Lớp không còn tồn tại");
      const used = (await Promise.all([prisma.classSubjectAssignment.count({ where: { schoolClassId: eid } }), prisma.timetableSlot.count({ where: { schoolClassId: eid } }), prisma.classPeriodLog.count({ where: { schoolClassId: eid } }), prisma.timetableActivity.count({ where: { schoolClassId: eid } }), prisma.studentClassEnrollment.count({ where: { schoolClassId: eid } }), prisma.classTransfer.count({ where: { OR: [{ fromClassId: eid }, { toClassId: eid }] } })])).some((n) => n > 0);
      if (used) throw new ConflictError("Lớp này đã có học sinh, phân công hoặc thời khoá biểu nên không hoàn tác việc tạo được.");
      await trashClass(admin.email, eid);
      break;
    }
    case "STUDENT_CLASS": {
      const yearId = meta.academicYearId as string;
      const enrollment = await prisma.studentClassEnrollment.findUnique({ where: { studentId_academicYearId: { studentId: eid, academicYearId: yearId } } });
      if (!enrollment || enrollment.schoolClassId !== after.classId) throw new ConflictError("Học sinh đã được chuyển lớp sau đó nên không hoàn tác tự động được.");
      const previous = before?.classId as string | null | undefined;
      if (previous) {
        const year = await prisma.academicYear.findUniqueOrThrow({ where: { id: yearId } });
        const now = new Date(); const day = (now < year.startDate ? year.startDate : now > year.endDate ? year.endDate : now).toISOString().slice(0, 10);
        try { await moveStudent(admin, { studentId: eid, targetClassId: previous, effectiveDate: day, reason: `Hoàn tác thay đổi của API (${id})`, decisionReference: "HOAN-TAC-API" }); }
        catch (e) { throw new ConflictError(`Không hoàn tác được việc chuyển lớp: ${(e as Error).message}`); }
      } else {
        await prisma.schoolClass.updateMany({ where: { id: enrollment.schoolClassId, monitorStudentId: eid }, data: { monitorStudentId: null } });
        await prisma.studentClassEnrollment.delete({ where: { id: enrollment.id } });
      }
      break;
    }
    default: throw new ConflictError("Loại thay đổi này chưa hỗ trợ hoàn tác");
  }
  await markReverted(id, admin.email);
  await audit(admin.email, "revert_api_change", "ApiChange", id);
}
