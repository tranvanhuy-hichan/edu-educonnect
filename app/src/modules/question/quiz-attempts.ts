/** Quy tắc số lần làm, tính điểm nhiều lần và giờ làm bài — hàm thuần, kiểm thử được. */

export type AttemptScoring = "BEST" | "LAST";
export const SCORING_LABEL: Record<string, string> = { BEST: "Lấy điểm cao nhất", LAST: "Lấy điểm lần làm cuối" };
/** Nộp trễ so với hạn giờ tối đa chừng này vẫn nhận (độ trễ mạng, đồng hồ máy học sinh lệch). */
export const TIME_GRACE_MS = 45_000;
export const MAX_ATTEMPTS_LIMIT = 10;

export const attemptsLeft = (max: number, used: number) => Math.max(0, max - used);

/** Lần làm mới có thay thế kết quả đang được tính không (chưa có kết quả thì luôn có). */
export function shouldReplaceSummary(scoring: string, existingGrade: number | null | undefined, newGrade: number): boolean {
  if (existingGrade == null) return true;
  return scoring === "LAST" ? true : newGrade > existingGrade;
}

export const deadlineOf = (startedAt: Date, limitMinutes: number) => new Date(startedAt.getTime() + limitMinutes * 60_000);
export const timeLeftMs = (startedAt: Date, limitMinutes: number, now = new Date()) => (limitMinutes > 0 ? deadlineOf(startedAt, limitMinutes).getTime() - now.getTime() : Infinity);
/** Đã quá hạn giờ làm bài (kể cả thời gian du di) chưa. */
export const isOvertime = (startedAt: Date, limitMinutes: number, now = new Date()) => limitMinutes > 0 && timeLeftMs(startedAt, limitMinutes, now) < -TIME_GRACE_MS;

/** Thứ tự đề: lần đầu dùng hạt giống cũ (giữ nguyên bài đã làm), các lần sau mỗi lần một thứ tự khác. */
export const shuffleSeedFor = (exerciseId: string, studentId: string, attemptNo: number) => (attemptNo > 1 ? `${exerciseId}:${studentId}:${attemptNo}` : `${exerciseId}:${studentId}`);

/**
 * Khi nào học sinh thấy đáp án đúng. Còn lượt làm lại thì chưa hiện (tránh lộ đáp án cho lần sau),
 * trừ khi giáo viên để "ngay sau khi nộp" và bài chỉ làm một lần.
 */
export function canRevealAnswers(opts: { showAnswers: string; dueDate: Date | null; submitted: boolean; attemptsLeft: number; now?: Date }): boolean {
  const { showAnswers, dueDate, submitted, attemptsLeft: left, now = new Date() } = opts;
  if (!submitted || showAnswers === "NEVER" || left > 0) return false;
  if (showAnswers === "AFTER_SUBMIT") return true;
  return !dueDate || now > new Date(dueDate.getTime() + 86_400_000);
}

export const formatClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(r).padStart(2, "0")}`;
};
