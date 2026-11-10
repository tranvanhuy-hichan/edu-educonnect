import { z } from "zod";

export const createLessonPostSchema = z.object({
  assignmentId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  attachments: z.array(z.string().url()).optional(),
});
export type CreateLessonPostInput = z.infer<typeof createLessonPostSchema>;

/** Bài tập là phần đính kèm của một bài học. */
export const createExerciseSchema = z.object({
  lessonPostId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  attachments: z.array(z.string().url()).optional(),
  dueDate: z.coerce.date().optional(),
  quizMode: z.boolean().default(false),
});
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const createLessonPlanSchema = z.object({
  assignmentId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  attachment: z.string().url().optional(),
});
export type CreateLessonPlanInput = z.infer<typeof createLessonPlanSchema>;

export const createSubmissionSchema = z.object({
  content: z.string().min(1),
});
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const gradeSubmissionSchema = z.object({
  grade: z.number().min(0).max(10),
  feedback: z.string().optional(),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
