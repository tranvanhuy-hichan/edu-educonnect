import { z } from "zod";

export const createYearEndResultSchema = z.object({
  studentId: z.string().min(1),
  academicYearId: z.string().min(1),
  overallAverage: z.number().min(0).max(10),
  conductRank: z.string().optional(),
  result: z.enum(["LEN_LOP", "O_LAI", "THI_LAI"]),
});
export type CreateYearEndResultInput = z.infer<typeof createYearEndResultSchema>;

/**
 * Hiệu trưởng chỉ định rõ lớp đích cho TỪNG học sinh (không suy luận tự động ánh xạ
 * khối-kế-tiếp bằng tên lớp, vì tên lớp không đảm bảo theo đúng quy luật ở mọi trường) —
 * đơn giản, tường minh, tránh suy đoán sai học sinh vào nhầm lớp.
 */
export const runClassPromotionJobSchema = z.object({
  academicYearFromId: z.string().min(1),
  academicYearToId: z.string().min(1),
  assignments: z
    .array(
      z.object({
        studentId: z.string().min(1),
        targetSchoolClassId: z.string().min(1),
      }),
    )
    .min(1),
});
export type RunClassPromotionJobInput = z.infer<
  typeof runClassPromotionJobSchema
>;
