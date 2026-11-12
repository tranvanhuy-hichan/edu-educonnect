import pino from "pino";

/**
 * Log JSON một dòng/sự kiện ra stdout — Vercel, Docker, Axiom, Better Stack, Loki... đều đọc được ngay.
 * Chỉnh mức log bằng biến LOG_LEVEL (debug | info | warn | error). Không ghi mật khẩu/cookie/token.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    service: "educonnect",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.APP_RELEASE,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  serializers: { err: pino.stdSerializers.err },
  redact: { paths: ["password", "*.password", "passwordHash", "*.passwordHash", "token", "*.token", "authorization", "cookie", "headers.cookie", "headers.authorization"], censor: "[REDACTED]" },
});
