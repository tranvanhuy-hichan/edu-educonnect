import { z } from "zod";

export const upsertScoreWeightConfigSchema = z.object({
  academicTermId: z.string().min(1),
  txWeight: z.number().positive().default(1),
  gkWeight: z.number().positive().default(2),
  ckWeight: z.number().positive().default(3),
});
export type UpsertScoreWeightConfigInput = z.infer<
  typeof upsertScoreWeightConfigSchema
>;

export const createScoreEntrySchema = z.object({
  studentId: z.string().min(1),
  assignmentId: z.string().min(1),
  academicTermId: z.string().min(1),
  scoreType: z.enum(["THUONG_XUYEN", "GIUA_KY", "CUOI_KY"]),
  value: z.number().min(0).max(10),
});
export type CreateScoreEntryInput = z.infer<typeof createScoreEntrySchema>;
