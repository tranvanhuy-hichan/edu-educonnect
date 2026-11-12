import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1).max(254), // email hoặc mã học sinh
  password: z.string().min(1).max(1024),
});
export type LoginInput = z.infer<typeof loginSchema>;
