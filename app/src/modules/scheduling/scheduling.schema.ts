import { z } from "zod";

export const createTimetableSlotSchema = z.object({
  versionId: z.string().min(1),
  schoolClassId: z.string().min(1),
  assignmentId: z.string().min(1),
  roomId: z.string().min(1),
  academicTermId: z.string().min(1),
  dayOfWeek: z.number().int().min(2).max(7), // Thứ 2 (2) .. Thứ 7 (7)
  periodNo: z.number().int().min(1).max(10),
});
export type CreateTimetableSlotInput = z.infer<typeof createTimetableSlotSchema>;
