import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type RateLimitRule = { limit: number; windowSec: number };
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

/** Mức giới hạn dùng chung. Chỉnh một chỗ, áp dụng toàn hệ thống. */
export const LIMITS = {
  upload: { limit: 30, windowSec: 60 },
  importAi: { limit: 5, windowSec: 600 },
  changePassword: { limit: 5, windowSec: 900 },
  jobsTrigger: { limit: 10, windowSec: 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * Cửa sổ cố định dùng bảng PostgreSQL chung (cùng bảng với giới hạn đăng nhập) nên đúng cả khi chạy nhiều instance serverless.
 * Định danh được băm, không lưu email/IP dạng rõ. Lỗi DB → cho qua (fail-open) để sự cố hạ tầng không khoá người dùng.
 */
export async function rateLimit(scope: string, identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const key = createHash("sha256").update(`rl:${scope}:${identifier.trim().toLowerCase()}`).digest("hex");
  try {
    const rows = await prisma.$queryRaw<{ count: number; ttl: number }[]>`
      INSERT INTO "LoginThrottle" ("key", "count", "expiresAt") VALUES (${key}, 1, NOW() + ${rule.windowSec}::double precision * INTERVAL '1 second')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "LoginThrottle"."expiresAt" <= NOW() THEN 1 ELSE "LoginThrottle"."count" + 1 END,
        "expiresAt" = CASE WHEN "LoginThrottle"."expiresAt" <= NOW() THEN NOW() + ${rule.windowSec}::double precision * INTERVAL '1 second' ELSE "LoginThrottle"."expiresAt" END
      RETURNING "count", CEIL(EXTRACT(EPOCH FROM ("expiresAt" - NOW())))::int AS "ttl"`;
    const { count, ttl } = rows[0];
    return { ok: count <= rule.limit, remaining: Math.max(0, rule.limit - count), retryAfterSec: Math.max(1, ttl) };
  } catch (error) {
    logger.warn({ err: error, scope }, "rate_limit_unavailable");
    return { ok: true, remaining: rule.limit, retryAfterSec: 0 };
  }
}

/** IP client phía sau proxy của Vercel/nginx. Chỉ dùng làm khoá giới hạn, không dùng để phân quyền. */
export function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export const tooManyRequests = (retryAfterSec: number, message = "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.") =>
  NextResponse.json({ error: message, retryAfterSec }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
