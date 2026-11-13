/** A stable year identifier is required for the shared calendar, regardless of the displayed dash. */
export function schoolYearIdentity(value: string) {
  const match = value.trim().match(/^(?:năm học\s*)?(\d{4})\s*[-–—/]\s*(\d{4})$/iu);
  if (!match || Number(match[2]) !== Number(match[1]) + 1 || Number(match[1]) < 2000 || Number(match[1]) > 2100) {
    throw new Error("Nhập năm học liên tiếp theo dạng 2026-2027");
  }
  const schoolYear = Number(match[1]);
  return { schoolYear, yearName: `${schoolYear}-${schoolYear + 1}` };
}
