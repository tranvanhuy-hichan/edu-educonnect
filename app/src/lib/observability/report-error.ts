import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { getRequestContext } from "./request-context";

export type ErrorSource = "render" | "route" | "action" | "job" | "client";
export type ErrorMeta = { source: ErrorSource; route?: string; method?: string; digest?: string; requestId?: string };

const trim = (s: string | undefined, n: number) => (s && s.length > n ? s.slice(0, n) : s);

/** Cùng một lỗi (cùng nguồn, route, thông điệp đã bỏ id/số) → cùng một dòng, chỉ tăng bộ đếm. */
export function fingerprintOf(err: unknown, meta: Pick<ErrorMeta, "source" | "route">): string {
  const e = err instanceof Error ? err : new Error(String(err));
  const msg = e.message.split("\n")[0].replace(/\b[a-z0-9]{20,}\b/gi, "#").replace(/\d+/g, "N");
  return createHash("sha1").update(`${meta.source}|${meta.route ?? ""}|${e.name}|${msg}`).digest("hex");
}

/**
 * Điểm báo lỗi duy nhất của hệ thống: ghi log JSON, lưu bảng ErrorLog (xem tại /van-hanh) và gửi Sentry nếu có SENTRY_DSN.
 * Không bao giờ ném lỗi — báo lỗi thất bại không được làm hỏng request đang xử lý.
 */
export async function reportError(err: unknown, meta: ErrorMeta): Promise<void> {
  const ctx = getRequestContext();
  const requestId = meta.requestId ?? ctx?.requestId;
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error({ err: error, ...meta, requestId, userId: ctx?.userId }, "unhandled_error");
  try {
    Sentry.withScope((scope) => {
      scope.setTag("source", meta.source);
      if (requestId) scope.setTag("request_id", requestId);
      if (meta.route) scope.setTag("route", meta.route);
      if (ctx?.userId) scope.setUser({ id: ctx.userId });
      Sentry.captureException(error);
    });
  } catch { /* Sentry chưa cấu hình */ }
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { prisma } = await import("@/lib/prisma");
    const fingerprint = fingerprintOf(error, meta);
    await prisma.errorLog.upsert({
      where: { fingerprint },
      create: { fingerprint, source: meta.source, message: trim(error.message, 500) ?? "", stack: trim(error.stack, 4000), route: meta.route, method: meta.method, digest: meta.digest, requestId },
      update: { count: { increment: 1 }, lastSeenAt: new Date(), status: "OPEN", requestId, digest: meta.digest, message: trim(error.message, 500) ?? "" },
    });
  } catch (dbError) {
    logger.warn({ err: dbError }, "error_log_persist_failed");
  }
}
