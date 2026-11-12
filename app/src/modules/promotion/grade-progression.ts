/** Catalog order defines progression; final-grade students require the graduation workflow. */
export function assertGradeProgression(grades: { id: string; sortOrder: number }[], sourceId: string, targetId: string, result: string) {
  const ordered = [...grades].sort((a, b) => a.sortOrder - b.sortOrder);
  if (new Set(ordered.map((g) => g.sortOrder)).size !== ordered.length) throw new Error("Thứ tự khối không rõ ràng");
  const sourceIndex = ordered.findIndex((g) => g.id === sourceId);
  const expected = ordered[sourceIndex + (result === "LEN_LOP" ? 1 : 0)];
  if (!["LEN_LOP", "O_LAI"].includes(result) || sourceIndex < 0 || !expected || targetId !== expected.id) throw new Error("Khối đích không phù hợp kết quả lên lớp/ở lại; học sinh cuối cấp cần quy trình tốt nghiệp");
}
