import { DEFAULT_POLICY, type Policy } from "@/lib/policy-schema";
/** Không suy diễn điểm còn thiếu thành 0. Làm tròn một chữ số thập phân. */
export const roundGrade = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
export function annualSubjectAverage(first: number | null | undefined, second: number | null | undefined) {
  if (first == null || second == null) return null;
  return roundGrade((first + 2 * second) / 3);
}
export function requiredRegularScores(annualPeriods: number) {
  return annualPeriods <= 35 ? 2 : annualPeriods <= 70 ? 3 : 4;
}
export type ScoreWeights = { tx: number; gk: number; ck: number };
export const DEFAULT_WEIGHTS: ScoreWeights = { tx: 1, gk: 2, ck: 3 };
/** Điểm TB học kỳ theo hệ số của học kỳ (mặc định TX×1, GK×2, CK×3). Thiếu điểm thì không suy diễn. */
export function semesterAverage(tx: number[], gk: number | null, ck: number | null, required: number, weights: ScoreWeights = DEFAULT_WEIGHTS) {
  if (tx.length < required || gk == null || ck == null) return null;
  const total = tx.length * weights.tx + weights.gk + weights.ck;
  if (total <= 0) return null;
  return roundGrade((tx.reduce((sum, value) => sum + value * weights.tx, 0) + weights.gk * gk + weights.ck * ck) / total);
}
export type AnnualSubject = { subjectId: string; name: string; type: "SCORE" | "COMMENT"; first: number | null; second: number | null; average: number | null; outcome: "DAT" | "CHUA_DAT" | null; exempt: boolean; missing: string[] };
export type LearningRank = string;
/** Xếp loại học lực cả năm theo quy chế cấu hình. Số môn đạt mức cao tối thiểu không vượt quá số môn tính điểm của lớp (lớp ít môn vẫn xếp loại được). */
export function learningRank(subjects: AnnualSubject[], policy: Policy = DEFAULT_POLICY): LearningRank | null {
  if (!subjects.length || subjects.some((subject) => subject.missing.length)) return null;
  const active = subjects.filter((subject) => !subject.exempt);
  const scores = active.filter((subject) => subject.type === "SCORE").map((subject) => subject.average!);
  const failedComments = active.filter((subject) => subject.type === "COMMENT" && subject.outcome === "CHUA_DAT").length;
  if (!scores.length) return null;
  const levels = policy.learning.levels;
  const rank = (values: number[], failed = failedComments): number => {
    for (let i = 0; i < levels.length - 1; i++) {
      const l = levels[i];
      if (failed <= l.maxFailedComments && values.every((v) => v >= l.minEach) && values.filter((v) => v >= l.highScore).length >= Math.min(l.highCount, values.length)) return i;
    }
    return levels.length - 1;
  };
  let level = rank(scores);
  // Một môn tính điểm kéo kết quả xuống từ hai mức: điều chỉnh lên một mức liền kề.
  if (scores.some((_, index) => rank(scores.map((value, at) => at === index ? 10 : value)) <= level - 2) || (failedComments === 1 && rank(scores, 0) <= level - 2)) level--;
  return levels[level].name;
}
export function suggestPromotion(subjects: AnnualSubject[], conduct: string | null | undefined, absenceDays: number | null | undefined, policy: Policy = DEFAULT_POLICY) {
  const rank = learningRank(subjects, policy);
  const conductLevels = policy.learning.conductLevels, worstConduct = conductLevels[conductLevels.length - 1], worstRank = policy.learning.levels[policy.learning.levels.length - 1].name;
  const missing = subjects.flatMap((subject) => subject.missing.map((reason) => `${subject.name}: ${reason}`));
  if (!subjects.length) missing.push("Chưa có danh sách môn học");
  if (!rank) missing.push("Chưa đủ dữ liệu đánh giá học tập");
  if (!conductLevels.includes(conduct ?? "")) missing.push("Chưa có đánh giá rèn luyện");
  if (absenceDays == null) missing.push("Chưa xác nhận số buổi nghỉ cả năm");
  const result = missing.length ? "CHUA_DU_DIEU_KIEN" : absenceDays! > policy.promotion.maxAbsenceDays ? "O_LAI" : rank === worstRank || conduct === worstConduct ? "THI_LAI" : "LEN_LOP";
  const numbers = subjects.filter((subject) => !subject.exempt && subject.average != null).map((subject) => subject.average!);
  return { result, learningRank: rank, missing, overallAverage: numbers.length && !subjects.some((subject) => subject.missing.length) ? roundGrade(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null } as const;
}
