import { z } from "zod";
import { validAttachment } from "@/lib/storage/validation";

const files = z.array(z.string().refine(validAttachment, "Tệp đính kèm không hợp lệ")).max(10).default([]);
const showAnswers = z.enum(["AFTER_SUBMIT", "AFTER_DUE", "NEVER"]).default("AFTER_DUE");

export const lessonInput = z.object({
  subjectId: z.string().min(1, "Chọn môn học"),
  gradeLevelId: z.string().min(1, "Chọn khối"),
  title: z.string().trim().min(1, "Nhập tên bài học").max(200),
  content: z.string().max(20000).default(""),
  attachments: files,
  orderNo: z.number().int().min(0).max(9999).optional(),
});
export type LessonInput = z.infer<typeof lessonInput>;

export const exerciseInput = z.object({
  title: z.string().trim().min(1, "Nhập tên bài tập").max(200),
  kind: z.enum(["NORMAL", "REVIEW"]).default("NORMAL"),
  quizMode: z.boolean().default(true),
  instructions: z.string().max(10000).default(""),
  attachments: files,
  showAnswers,
  secureMode: z.boolean().default(false),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(10).default(1),
  attemptScoring: z.enum(["BEST", "LAST"]).default("BEST"),
  timeLimitMinutes: z.number().int().min(0).max(600).default(0),
  allowReview: z.boolean().default(true),
  maxViolations: z.number().int().min(0).max(20).default(3),
  sourceLessonIds: z.array(z.string().min(1)).max(30).default([]),
});
export type ExerciseInput = z.infer<typeof exerciseInput>;
