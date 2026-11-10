import { z } from "zod";
export const examPlanSchema = z.object({
  title: z.string().trim().min(2, "Nhập tên kỳ thi").max(200),
  category: z.enum(["GIUA_KY", "CUOI_KY", "THI_LAI", "KHAC"]),
  termId: z.string().min(1), gradeId: z.string().min(1), notes: z.string().max(3000).default(""),
  papers: z.array(z.object({
    subjectId: z.string().min(1), grouping: z.enum(["CLASS", "ALPHABET"]),
    maxPerRoom: z.number().int().min(1).max(500).nullable(), roomCount: z.number().int().min(1).max(200).nullable(),
    excludedStudentIds: z.array(z.string().min(1)).max(10000).default([]),
    startsAt: z.string().max(16).default(""), durationMinutes: z.number().int().min(5).max(360), reportMinutes: z.number().int().min(0).max(120),
    allocations: z.array(z.object({ key: z.string().min(1), roomId: z.string().nullable(), teacherIds: z.array(z.string().min(1)).max(4) })).max(200).default([]),
  })).min(1, "Chọn ít nhất một môn thi").max(30),
});
export type ExamPlan = z.infer<typeof examPlanSchema>;
export function parseExamPlan(value: string) {
  if (value.length > 300000) throw new Error("Kế hoạch thi quá lớn");
  let input: unknown;
  try { input = JSON.parse(value); } catch { throw new Error("Dữ liệu lịch thi không hợp lệ"); }
  const parsed = examPlanSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Thông tin lịch thi không hợp lệ");
  if (new Set(parsed.data.papers.map((paper) => paper.subjectId)).size !== parsed.data.papers.length) throw new Error("Mỗi môn chỉ được thêm một lần trong kỳ thi");
  return parsed.data;
}
