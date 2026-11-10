import { z } from "zod";

export const createEmulationCriteriaSchema = z.object({
  criteriaName: z.string().min(1),
  weight: z.number(),
});
export type CreateEmulationCriteriaInput = z.infer<
  typeof createEmulationCriteriaSchema
>;

export const recalculateClassEmulationScoreSchema = z.object({
  schoolClassId: z.string().min(1),
  academicTermId: z.string().min(1),
  periodLabel: z.string().min(1),
  /** Khoảng ngày của kỳ thi đua (tuần/tháng); bỏ trống = cả học kỳ. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type RecalculateClassEmulationScoreInput = z.infer<
  typeof recalculateClassEmulationScoreSchema
>;
