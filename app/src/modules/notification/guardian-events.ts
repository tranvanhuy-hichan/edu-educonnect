import { reportError } from "@/lib/observability/report-error";
import { notifyUsers } from "./notification.service";
import { notifyGuardians, type GuardianTarget } from "./parent-notification.service";
import * as repo from "./parent-notification.repository";
import { getSchoolSetting } from "@/lib/school-setting";

const schoolName = async () => (await getSchoolSetting()).schoolName;

/**
 * Thông báo phát sinh từ nghiệp vụ gửi cho HỌC SINH và PHỤ HUYNH. Gọi SAU khi dữ liệu đã lưu thành công.
 * Mọi lỗi ở đây chỉ được ghi nhận (log + /van-hanh), không bao giờ làm hỏng thao tác chính của giáo viên.
 */
const safely = async (what: string, fn: () => Promise<unknown>) => {
  try { await fn(); } catch (error) { await reportError(error, { source: "action", route: `notify:${what}` }); }
};

export type ScoreSet = { tx: number[]; gk: number | null; ck: number | null };
const fmt = (n: number) => String(Number(n.toFixed(2))).replace(".", ",");
/** "TX 8; 9 · GK 7 · CK 8" — chỉ liệt kê cột đã có điểm. */
export function describeScores(s: ScoreSet): string {
  const parts = [s.tx.length ? `TX ${s.tx.map(fmt).join("; ")}` : "", s.gk != null ? `GK ${fmt(s.gk)}` : "", s.ck != null ? `CK ${fmt(s.ck)}` : ""].filter(Boolean);
  return parts.join(" · ") || "chưa có điểm";
}
/** Hai bộ điểm có khác nhau không (bỏ qua thứ tự các cột thường xuyên). */
export const scoresDiffer = (a: ScoreSet, b: ScoreSet) =>
  [...a.tx].sort().join() !== [...b.tx].sort().join() || a.gk !== b.gk || a.ck !== b.ck;

/** Giáo viên lưu điểm: báo cho từng học sinh có điểm THAY ĐỔI và phụ huynh của họ. Chỉ khi điểm đang hiển thị (học kỳ chưa khoá xem); khi công bố sẽ có thông báo riêng. */
export function notifyScoresChanged(p: { subjectName: string; termName: string; gradesHidden: boolean; changes: { studentId: string; after: ScoreSet }[] }) {
  if (p.gradesHidden || !p.changes.length) return Promise.resolve();
  return safely("scores", async () => {
    const students = await repo.studentsForNotice(p.changes.map((c) => c.studentId));
    const after = new Map(p.changes.map((c) => [c.studentId, c.after]));
    const detail = (s: GuardianTarget) => describeScores(after.get(s.id)!);
    const school = await schoolName();
    for (const s of students) {
      if (s.userId) await notifyUsers([s.userId], { title: `Điểm ${p.subjectName} vừa được cập nhật`, content: `Điểm môn ${p.subjectName} (${p.termName}): ${detail(s)}. Xem chi tiết trong mục Bảng điểm.`, type: "GRADE", link: "/diem-cua-toi" });
    }
    await notifyGuardians(students, (s) => ({ title: `Điểm ${p.subjectName} của em ${s.fullName}`, content: `Điểm môn ${p.subjectName} (${p.termName}) của em ${s.fullName} vừa được cập nhật: ${detail(s)}.`, type: "GRADE", sms: `[${school}] Diem ${p.subjectName} (${p.termName}) cua em ${s.fullName}: ${detail(s)}.` }), { smsEvent: "score_changed", school });
  });
}

/** Hiệu trưởng/Admin công bố điểm học kỳ: báo phụ huynh của mọi học sinh trong năm học (học sinh đã được báo ở nơi gọi). */
export function notifyGradesPublishedToGuardians(p: { academicYearId: string; termName: string; yearName: string }) {
  return safely("grades-published", async () => {
    const students = await repo.studentsOfYearForNotice(p.academicYearId);
    const school = await schoolName();
    await notifyGuardians(students, (s) => ({ title: `Đã công bố điểm ${p.termName}`, content: `Nhà trường đã công bố điểm ${p.termName} · ${p.yearName} của em ${s.fullName}. Phụ huynh có thể xem trong Sổ liên lạc.`, type: "GRADE", sms: `[${school}] Da cong bo diem ${p.termName} cua em ${s.fullName}. Xem tai So lien lac dien tu.` }), { smsEvent: "grades_published", school });
  });
}

/** Học sinh VỪA ĐƯỢC ghi vắng trong một tiết (không báo lại những em đã được ghi vắng từ lần lưu trước). */
export const newlyAbsent = (previous: Iterable<string>, next: { studentId: string; excused: boolean }[]) => {
  const before = new Set(previous);
  return next.filter((a) => !before.has(a.studentId));
};

export function notifyAbsences(p: { absences: { studentId: string; excused: boolean }[]; subjectName: string; periodNo: number; logDate: Date }) {
  if (!p.absences.length) return Promise.resolve();
  return safely("absence", async () => {
    const excused = new Map(p.absences.map((a) => [a.studentId, a.excused]));
    const students = await repo.studentsForNotice(p.absences.map((a) => a.studentId));
    const day = p.logDate.toLocaleDateString("vi-VN", { timeZone: "UTC" });
    const school = await schoolName();
    const shortDay = p.logDate.toLocaleDateString("vi-VN", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
    await notifyGuardians(students, (s) => ({
      title: `Em ${s.fullName} vắng mặt`,
      content: `Em ${s.fullName} vắng tiết ${p.periodNo} môn ${p.subjectName} ngày ${day} (${excused.get(s.id) ? "có phép" : "không phép"}). Nếu có sai sót, phụ huynh vui lòng liên hệ giáo viên chủ nhiệm.`,
      type: "ATTENDANCE",
      sms: `[${school}] Em ${s.fullName} vang tiet ${p.periodNo} mon ${p.subjectName} ngay ${shortDay} (${excused.get(s.id) ? "co phep" : "khong phep"}).`,
    }), { smsEvent: "absence", school });
  });
}
