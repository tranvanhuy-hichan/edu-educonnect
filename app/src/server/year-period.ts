/**
 * Bộ lọc xem điểm: chọn NĂM HỌC trước, rồi chọn HK1 / HK2 / Cả năm (điểm cả năm = (HK1 + HK2 × 2) / 3).
 * Dùng chung cho học sinh, phụ huynh và hồ sơ học sinh.
 */
export type PeriodKey = "HK1" | "HK2" | "YEAR";
export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [{ value: "HK1", label: "Học kỳ 1" }, { value: "HK2", label: "Học kỳ 2" }, { value: "YEAR", label: "Cả năm (HK1 + HK2×2)/3" }];
export type PeriodTerm = { id: string; termName: string; academicYearId: string; yearName: string; startDate: Date; endDate: Date };

export function resolvePeriod<T extends PeriodTerm>(terms: T[], sp: { yearId?: string; period?: string }, currentTermId: string | null) {
  const current = terms.find((t) => t.id === currentTermId);
  const years = [...new Map(terms.map((t) => [t.academicYearId, { id: t.academicYearId, yearName: t.yearName, startDate: t.startDate }])).values()].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const yearId = years.find((y) => y.id === sp.yearId)?.id ?? current?.academicYearId ?? years[0]?.id ?? "";
  const yearTerms = terms.filter((t) => t.academicYearId === yearId);
  const asked = ["HK1", "HK2", "YEAR"].includes(sp.period ?? "") ? (sp.period as PeriodKey) : undefined;
  const period: PeriodKey = asked ?? (current && current.academicYearId === yearId && (current.termName === "HK1" || current.termName === "HK2") ? (current.termName as PeriodKey) : "YEAR");
  const term = period === "YEAR" ? undefined : yearTerms.find((t) => t.termName === period);
  return { years, yearId, yearTerms, period, term };
}
