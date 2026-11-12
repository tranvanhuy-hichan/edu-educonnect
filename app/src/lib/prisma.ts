import { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

/** Truy vấn chậm hơn ngưỡng này (ms) được ghi log cảnh báo kèm câu SQL (không kèm tham số vì có thể chứa dữ liệu cá nhân). */
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 500);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && "studentAssessment" in existing && "classTransfer" in existing && "scoreUnlockRequest" in existing && "storedFile" in existing) {
    return existing;
  }
  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }, { emit: "event", level: "warn" }, { emit: "event", level: "error" }] });
  client.$on("query", (e) => { if (e.duration >= SLOW_QUERY_MS) logger.warn({ durationMs: e.duration, query: e.query.slice(0, 600) }, "slow_query"); });
  client.$on("warn", (e) => logger.warn({ target: e.target }, e.message));
  client.$on("error", (e) => logger.error({ target: e.target }, e.message));
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client as unknown as PrismaClient;
}

export const prisma = getClient();
