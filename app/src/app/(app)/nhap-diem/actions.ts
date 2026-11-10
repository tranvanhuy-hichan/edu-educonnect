"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { recalculateSubjectTermAverage } from "@/modules/scoring/scoring.service";

type Row = { studentId: string; tx: number[]; gk: number | null; ck: number | null };

const valid = (n: number | null) => n == null || (Number.isFinite(n) && n >= 0 && n <= 10);

/** Lưu các dòng điểm đã sửa: ghi lại toàn bộ điểm của học sinh đó rồi tính lại điểm TB môn theo hệ số học kỳ. */
export const saveScores = wrap(async (fd) => {
  const me = await assertRole(...TEACHING_ROLES, ...MANAGER_ROLES);
  const assignmentId = str(fd, "assignmentId");
  const a = await db.classSubjectAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { schoolClass: true, subject: true, academicTerm: true },
  });
  if (!(await canManageClassSubjectAssignment(me, assignmentId))) throw new Error("Bạn không phụ trách lớp-môn này");

  // Kiểm tra khóa sổ điểm
  const term = a.academicTerm;
  const isManager = me.roles.some((r) => (MANAGER_ROLES as readonly string[]).includes(r));
  const isPast15Days = term.endDate && (Date.now() - new Date(term.endDate).getTime() > 15 * 24 * 60 * 60 * 1000);
  const isLocked = term.isLocked || isPast15Days;

  if (isLocked && !isManager) {
    if (term.isLocked) {
      throw new Error(`Sổ điểm học kỳ ${term.termName} đã bị khóa bởi Ban Giám hiệu. Bạn không thể chỉnh sửa điểm.`);
    }
    throw new Error(`Học kỳ ${term.termName} đã kết thúc quá 15 ngày, sổ điểm đã tự động khóa. Vui lòng liên hệ Ban Giám hiệu để mở khóa.`);
  }

  let rows: Row[];
  try { rows = JSON.parse(str(fd, "rows")); } catch { throw new Error("Dữ liệu không hợp lệ"); }

  const enrolled = new Set((await db.studentClassEnrollment.findMany({ where: { schoolClassId: a.schoolClassId }, select: { studentId: true } })).map((e) => e.studentId));
  let changed = 0;
  for (const r of rows) {
    if (!enrolled.has(r.studentId)) continue;
    if (!valid(r.gk) || !valid(r.ck) || !r.tx.every((n) => valid(n))) throw new Error("Điểm phải từ 0 đến 10");
    const base = Date.now();
    const data = [
      ...r.tx.map((value, i) => ({ scoreType: "THUONG_XUYEN" as const, value, createdAt: new Date(base + i) })),
      ...(r.gk != null ? [{ scoreType: "GIUA_KY" as const, value: r.gk, createdAt: new Date(base + 100) }] : []),
      ...(r.ck != null ? [{ scoreType: "CUOI_KY" as const, value: r.ck, createdAt: new Date(base + 101) }] : []),
    ].map((x) => ({ ...x, studentId: r.studentId, assignmentId, academicTermId: a.academicTermId }));
    const key = { studentId: r.studentId, assignmentId, academicTermId: a.academicTermId };
    await db.$transaction([db.scoreEntry.deleteMany({ where: key }), db.scoreEntry.createMany({ data })]);
    if (data.length) await recalculateSubjectTermAverage(r.studentId, assignmentId, a.academicTermId);
    else await db.subjectTermAverage.deleteMany({ where: key });
    changed++;
  }
  if (changed) await audit(me.email, "save_scores", "ClassSubjectAssignment", assignmentId);
  revalidatePath("/nhap-diem");
  revalidatePath(`/nhap-diem/${assignmentId}`);
  return `Đã lưu điểm (${changed} học sinh thay đổi)`;
});

/** Ban giám hiệu / Admin khóa hoặc mở khóa sổ điểm học kỳ */
export const toggleLockTerm = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const termId = str(fd, "termId");
  const lock = fd.get("lock") === "true";

  const term = await db.academicTerm.update({
    where: { id: termId },
    data: {
      isLocked: lock,
      lockedAt: lock ? new Date() : null,
      lockedBy: lock ? (me.name || me.email) : null,
    },
  });

  await audit(me.email, lock ? "lock_term" : "unlock_term", "AcademicTerm", termId);
  revalidatePath("/nhap-diem");
  return lock ? `Đã khóa sổ điểm ${term.termName}` : `Đã mở khóa sổ điểm ${term.termName}`;
});
