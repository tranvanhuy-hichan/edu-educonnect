import { z } from "zod";

export const createClassPeriodLogSchema = z.object({
  timetableSlotId: z.string().min(1),
  logDate: z.coerce.date(),
  attendanceAbsentCount: z.number().int().min(0).default(0),
  conductRating: z.string().max(30).optional(), // thuộc danh sách xếp loại tiết học trong Quy chế (kiểm tra ở service)
  note: z.string().optional(),
  lessonTitle: z.string().max(1000).optional(),
  /** Danh sách học sinh vắng; bỏ trống (undefined) = giữ số vắng nhập tay như cũ. */
  absences: z.array(z.object({ studentId: z.string().min(1), excused: z.boolean() })).max(200).optional(),
});
export type CreateClassPeriodLogInput = z.infer<typeof createClassPeriodLogSchema>;
