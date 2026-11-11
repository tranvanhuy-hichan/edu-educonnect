import { annualSubjectAverage, roundGrade } from "./annual";

/** Điểm TB một môn trong một học kỳ (lấy từ SubjectTermAverage). */
export type TermAverage = { subjectId: string; subjectName: string; termName: string; value: number };
export type YearRow = { subjectId: string; subjectName: string; hk1: number | null; hk2: number | null; year: number | null };

/**
 * Gộp điểm các học kỳ của một năm học thành từng dòng môn: HK1, HK2 và cả năm = (HK1 + HK2 × 2) / 3.
 * Điểm học kỳ làm tròn 1 chữ số như khi xét lên lớp; thiếu một học kỳ thì chưa tính cả năm (không coi là 0).
 */
export function buildYearRows(items: TermAverage[]): YearRow[] {
  const bySubject = new Map<string, YearRow>();
  for (const it of items) {
    const row = bySubject.get(it.subjectId) ?? { subjectId: it.subjectId, subjectName: it.subjectName, hk1: null, hk2: null, year: null };
    if (it.termName === "HK1") row.hk1 = roundGrade(it.value);
    if (it.termName === "HK2") row.hk2 = roundGrade(it.value);
    bySubject.set(it.subjectId, row);
  }
  return [...bySubject.values()].map((r) => ({ ...r, year: annualSubjectAverage(r.hk1, r.hk2) })).sort((a, b) => a.subjectName.localeCompare(b.subjectName, "vi"));
}

/** Trung bình các môn (bỏ môn thiếu điểm); null nếu chưa có môn nào. */
export function meanOf(values: (number | null)[]) {
  const v = values.filter((x): x is number => x != null);
  return v.length ? roundGrade(v.reduce((s, x) => s + x, 0) / v.length) : null;
}
