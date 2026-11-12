import { z } from "zod";
import { validAttachment } from "@/lib/storage/validation";
import { QUESTION_TYPES, parseNumber } from "./question.grading";

const image = z.string().refine(validAttachment, "Ảnh đính kèm không hợp lệ");

const optionSchema = z.object({
  content: z.string().trim().max(2000).default(""),
  images: z.array(image).max(1).default([]),
  isCorrect: z.boolean().default(false),
});

const answerKeySchema = z.object({
  mode: z.enum(["NUMBER", "TEXT"]),
  answers: z.array(z.string().trim().min(1).max(200)).min(1, "Nhập ít nhất một đáp án đúng").max(10),
  tolerance: z.number().min(0).default(0),
});

export const questionInputSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    subjectId: z.string().min(1, "Chọn môn học"),
    gradeLevelId: z.string().min(1, "Chọn khối"),
    libraryLessonId: z.string().min(1).nullable().default(null),
    topic: z.string().trim().max(200).nullable().default(null),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
    content: z.string().trim().max(10000).default(""),
    images: z.array(image).max(6).default([]),
    explanation: z.string().trim().max(5000).nullable().default(null),
    options: z.array(optionSchema).max(6).default([]),
    answerKey: answerKeySchema.nullable().default(null),
  })
  .superRefine((q, ctx) => {
    const bad = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: "custom", message, path });
    if (!q.content && !q.images.length) bad("Nhập nội dung câu hỏi hoặc đính kèm ảnh", ["content"]);
    const filled = (o: { content: string; images: string[] }) => o.content.length > 0 || o.images.length > 0;

    if (q.type === "SINGLE_CHOICE") {
      if (q.options.length < 2) bad("Cần ít nhất 2 đáp án");
      if (q.options.some((o) => !filled(o))) bad("Mỗi đáp án cần có nội dung hoặc ảnh");
      if (q.options.filter((o) => o.isCorrect).length !== 1) bad("Chọn đúng 1 đáp án đúng");
    }
    if (q.type === "TRUE_FALSE_GROUP") {
      if (q.options.length !== 4) bad("Câu Đúng/Sai gồm đúng 4 ý a, b, c, d");
      if (q.options.some((o) => !filled(o))) bad("Mỗi ý cần có nội dung hoặc ảnh");
    }
    if (q.type === "SHORT_ANSWER") {
      if (!q.answerKey) bad("Nhập đáp án đúng", ["answerKey"]);
      else if (q.answerKey.mode === "NUMBER" && q.answerKey.answers.some((a) => !Number.isFinite(parseNumber(a)))) bad("Đáp án dạng số phải là số (vd 3,14)", ["answerKey"]);
    }
  });
export type QuestionInput = z.infer<typeof questionInputSchema>;
