import { z } from "zod";

const ROLE_VALUES = [
  "ADMIN",
  "PRINCIPAL",
  "VICE_PRINCIPAL",
  "HOMEROOM_TEACHER",
  "SUBJECT_TEACHER",
  "LIBRARIAN",
  "STUDENT",
] as const;

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  roles: z.array(z.enum(ROLE_VALUES)).min(1),
  /** Bắt buộc khi có vai trò giáo viên: dùng tạo hồ sơ giáo viên đi kèm tài khoản. */
  fullName: z.string().trim().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserRolesSchema = z.object({
  roles: z.array(z.enum(ROLE_VALUES)).min(1),
});
export type UpdateUserRolesInput = z.infer<typeof updateUserRolesSchema>;

export const setUserActiveSchema = z.object({
  isActive: z.boolean(),
});
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6).optional(),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
