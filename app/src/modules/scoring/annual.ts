/** Không suy diễn điểm còn thiếu thành 0. Làm tròn một chữ số thập phân. */
export const roundGrade = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
export function annualSubjectAverage(first: number | null | undefined, second: number | null | undefined) {
  if (first == null || second == null) return null;
  return roundGrade((first + 2 * second) / 3);
}
export function requiredRegularScores(annualPeriods: number) {
  return annualPeriods <= 35 ? 2 : annualPeriods <= 70 ? 3 : 4;
}
export function semesterAverage(tx: number[], gk: number | null, ck: number | null, required: number) {
  if (tx.length < required || gk == null || ck == null) return null;
  return roundGrade((tx.reduce((sum, value) => sum + value, 0) + 2 * gk + 3 * ck) / (tx.length + 5));
}
export type AnnualSubject = { subjectId: string; name: string; type: "SCORE" | "COMMENT"; first: number | null; second: number | null; average: number | null; outcome: "DAT" | "CHUA_DAT" | null; exempt: boolean; missing: string[] };
export type LearningRank = "Tốt" | "Khá" | "Đạt" | "Chưa đạt";
export function learningRank(subjects: AnnualSubject[]): LearningRank | null {
  if (!subjects.length || subjects.some((subject) => subject.missing.length)) return null;
  const active = subjects.filter((subject) => !subject.exempt);
  const scores = active.filter((subject) => subject.type === "SCORE").map((subject) => subject.average!);
  const failedComments = active.filter((subject) => subject.type === "COMMENT" && subject.outcome === "CHUA_DAT").length;
  if (!scores.length) return null;
  const rank = (values: number[], failed = failedComments): number => {
    if (!failed && values.every((value) => value >= 6.5) && values.filter((value) => value >= 8).length >= 6) return 0;
    if (!failed && values.every((value) => value >= 5) && values.filter((value) => value >= 6.5).length >= 6) return 1;
    if (failed <= 1 && values.every((value) => value >= 3.5) && values.filter((value) => value >= 5).length >= 6) return 2;
    return 3;
  };
  let level = rank(scores);
  // Một môn tính điểm kéo kết quả xuống từ hai mức: điều chỉnh lên một mức liền kề.
  if (scores.some((_, index) => rank(scores.map((value, at) => at === index ? 10 : value)) <= level - 2) || (failedComments === 1 && rank(scores, 0) <= level - 2)) level--;
  return (["Tốt", "Khá", "Đạt", "Chưa đạt"] as const)[level];
}
export function suggestPromotion(subjects: AnnualSubject[], conduct: string | null | undefined, absenceDays: number | null | undefined) {
  const rank = learningRank(subjects);
  const missing = subjects.flatMap((subject) => subject.missing.map((reason) => `${subject.name}: ${reason}`));
  if (!subjects.length) missing.push("Chưa có danh sách môn học");
  if (!rank) missing.push("Chưa đủ dữ liệu đánh giá học tập");
  if (!["Tốt", "Khá", "Đạt", "Chưa đạt"].includes(conduct ?? "")) missing.push("Chưa có đánh giá rèn luyện");
  if (absenceDays == null) missing.push("Chưa xác nhận số buổi nghỉ cả năm");
  const result = missing.length ? "CHUA_DU_DIEU_KIEN" : absenceDays! > 45 ? "O_LAI" : rank === "Chưa đạt" || conduct === "Chưa đạt" ? "THI_LAI" : "LEN_LOP";
  const numbers = subjects.filter((subject) => !subject.exempt && subject.average != null).map((subject) => subject.average!);
  return { result, learningRank: rank, missing, overallAverage: numbers.length && !subjects.some((subject) => subject.missing.length) ? roundGrade(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null } as const;
}
