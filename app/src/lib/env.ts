import { z } from "zod";
import { logger } from "@/lib/logger";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "thiếu DATABASE_URL"),
  JWT_SECRET: z.string().min(1, "thiếu JWT_SECRET"),
  STORAGE_PROVIDER: z.enum(["cloudinary", "minio"]).optional(),
  CRON_SECRET: z.string().min(16, "CRON_SECRET cần tối thiểu 16 ký tự").optional(),
});

/**
 * Kiểm tra cấu hình khi khởi động. Production: thiếu cấu hình bắt buộc → dừng ngay (lỗi rõ ràng hơn lỗi mơ hồ lúc đang chạy).
 * Dev/test: chỉ cảnh báo.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const parsed = schema.safeParse(env);
  if (!parsed.success) problems.push(...parsed.error.issues.map((i) => i.message));
  // Chỉ cảnh báo (không chặn khởi động) để không làm sập hệ thống đang chạy; hãy đổi sang khoá dài khi có thể.
  if (env.NODE_ENV === "production" && env.JWT_SECRET && env.JWT_SECRET.length < 32) logger.warn("JWT_SECRET ngắn hơn 32 ký tự, nên đổi khoá dài hơn (đăng xuất mọi người dùng khi đổi)");
  if (problems.length) {
    logger.error({ problems }, "invalid_environment");
    if (env.NODE_ENV === "production" && env.NEXT_PHASE !== "phase-production-build") throw new Error(`Cấu hình không hợp lệ: ${problems.join("; ")}`);
  }
  return problems;
}
