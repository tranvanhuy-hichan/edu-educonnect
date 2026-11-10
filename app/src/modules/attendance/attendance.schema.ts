import { z } from "zod";

export const createClassPeriodLogSchema = z.object({
  timetableSlotId: z.string().min(1),
  logDate: z.coerce.date(),
  attendanceAbsentCount: z.number().int().min(0).default(0),
  conductRating: z.enum(["TOT", "KHA", "TB", "YEU"]).optional(),
  note: z.string().optional(),
});
export type CreateClassPeriodLogInput = z.infer<typeof createClassPeriodLogSchema>;
