import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

/** Khởi động một lần khi server chạy: bật Sentry (nếu có SENTRY_DSN) và kiểm tra cấu hình bắt buộc. */
export async function register() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_RELEASE,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    });
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}

/** Mọi lỗi server (render trang, route, server action) đều đi qua đây. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportError } = await import("@/lib/observability/report-error");
  const rid = request.headers["x-request-id"];
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  await reportError(error, {
    source: context.routeType === "route" ? "route" : context.routeType === "action" ? "action" : "render",
    route: context.routePath, method: request.method, digest, requestId: Array.isArray(rid) ? rid[0] : rid,
  });
};
