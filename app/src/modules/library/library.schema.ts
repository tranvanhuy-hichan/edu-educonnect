import { z } from "zod";

export const createBookTitleSchema = z.object({
  title: z.string().min(1, "Nhập tên sách"),
  code: z.string().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  publishYear: z.number().int().optional(),
  category: z.string().optional(),
  shelfLocation: z.string().optional(),
  description: z.string().optional(),
  isbn: z.string().optional(),
  totalCopies: z.number().int().min(0).default(0),
});
export type CreateBookTitleInput = z.infer<typeof createBookTitleSchema>;

export const updateBookTitleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Nhập tên sách"),
  code: z.string().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  publishYear: z.number().int().optional(),
  category: z.string().optional(),
  shelfLocation: z.string().optional(),
  description: z.string().optional(),
  isbn: z.string().optional(),
});
export type UpdateBookTitleInput = z.infer<typeof updateBookTitleSchema>;

export const createBookCopySchema = z.object({
  bookTitleId: z.string().min(1),
  copyCode: z.string().min(1, "Nhập mã bản sao"),
  condition: z.string().optional(),
});
export type CreateBookCopyInput = z.infer<typeof createBookCopySchema>;

export const createLoanSchema = z.object({
  studentId: z.string().min(1, "Chọn học sinh"),
  bookCopyIds: z.array(z.string().min(1)).min(1, "Chọn ít nhất một cuốn sách"),
  dueDate: z.coerce.date(),
  note: z.string().optional(),
  loanCode: z.string().optional(),
});
export type CreateLoanInput = z.infer<typeof createLoanSchema>;

export const returnLoanSchema = z.object({
  loanId: z.string().min(1),
  note: z.string().optional(),
});
export type ReturnLoanInput = z.infer<typeof returnLoanSchema>;

export const returnLoanItemSchema = z.object({
  loanItemId: z.string().min(1),
  note: z.string().optional(),
  status: z.enum(["RETURNED", "LOST"]).default("RETURNED"),
});
export type ReturnLoanItemInput = z.infer<typeof returnLoanItemSchema>;

export const extendLoanSchema = z.object({
  loanId: z.string().min(1),
  newDueDate: z.coerce.date(),
});
export type ExtendLoanInput = z.infer<typeof extendLoanSchema>;
