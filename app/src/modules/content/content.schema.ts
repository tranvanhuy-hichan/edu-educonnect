import { validAttachment } from "@/lib/storage/validation";
import { z } from "zod";

export const createLessonPostSchema = z.object({
  assignmentId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().default(""),
  attachments: z.array(z.string().refine(validAttachment, "Tệp đính kèm không hợp lệ")).max(10).optional(),
});
export type CreateLessonPostInput = z.infer<typeof createLessonPostSchema>;

/** Bài tập là phần đính kèm của một bài học. */
export const createExerciseSchema = z.object({
  lessonPostId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().default(""),
  attachments: z.array(z.string().refine(validAttachment, "Tệp đính kèm không hợp lệ")).max(10).optional(),
  dueDate: z.coerce.date().optional(),
  quizMode: z.boolean().default(false),
  showAnswers: z.enum(["AFTER_SUBMIT", "AFTER_DUE", "NEVER"]).optional(),
  secureMode: z.boolean().optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  attemptScoring: z.enum(["BEST", "LAST"]).optional(),
  timeLimitMinutes: z.number().int().min(0).max(600).optional(),
  allowReview: z.boolean().optional(),
  maxViolations: z.number().int().min(0).max(20).optional(),
});
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const createSubmissionSchema = z.object({
  content: z.string().default(""),
  attachments: z.array(z.string().refine(validAttachment, "Tệp đính kèm không hợp lệ")).max(10).default([]),
}).refine((data) => data.content.trim().length > 0 || data.attachments.length > 0, "Nhập bài làm hoặc tải tệp");
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const gradeSubmissionSchema = z.object({
  grade: z.number().min(0).max(10),
  feedback: z.string().optional(),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
