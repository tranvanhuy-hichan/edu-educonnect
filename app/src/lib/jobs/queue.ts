import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { reportError } from "@/lib/observability/report-error";

export type JobRow = { id: string; type: string; payload: Prisma.JsonValue; attempts: number; maxAttempts: number; createdBy: string | null };
export type JobContext = { setProgress: (percent: number) => Promise<void> };
export type JobHandler = (job: JobRow, ctx: JobContext) => Promise<Prisma.InputJsonValue | void>;

/** Thời gian một worker được "giữ" việc. Phải lớn hơn maxDuration của route chạy worker (300s). Quá hạn → việc được giao lại. */
export const LEASE_SECONDS = 360;
const BACKOFF_BASE_SECONDS = 30;

const registry = new Map<string, JobHandler>();
export const registerJob = (type: string, handler: JobHandler) => { registry.set(type, handler); };

/** Thêm việc vào hàng đợi. dedupeKey trùng → không tạo việc thứ hai (an toàn khi người dùng bấm lặp). */
export async function enqueue(type: string, payload: Prisma.InputJsonValue, opts: { dedupeKey?: string; maxAttempts?: number; runAt?: Date; createdBy?: string } = {}) {
  try {
    return await prisma.job.create({ data: { type, payload, dedupeKey: opts.dedupeKey, maxAttempts: opts.maxAttempts ?? 3, runAt: opts.runAt ?? new Date(), createdBy: opts.createdBy } });
  } catch (error) {
    if (opts.dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return prisma.job.findUniqueOrThrow({ where: { dedupeKey: opts.dedupeKey } });
    throw error;
  }
}

/** Việc đang chạy mà worker đã chết/timeout quá hạn lease: hết lượt thử thì đánh FAILED, còn lượt thì claim() sẽ giao lại. */
async function failExhaustedStale(): Promise<number> {
  return prisma.$executeRaw`UPDATE "edu"."Job" SET "status" = 'FAILED', "finishedAt" = NOW(), "lastError" = 'Worker dừng giữa chừng và đã hết số lần thử'
    WHERE "status" = 'RUNNING' AND "lockedAt" < NOW() - ${LEASE_SECONDS}::double precision * INTERVAL '1 second' AND "attempts" >= "maxAttempts"`;
}

async function claim(workerId: string): Promise<JobRow | null> {
  const rows = await prisma.$queryRaw<JobRow[]>`
    UPDATE "edu"."Job" SET "status" = 'RUNNING', "lockedAt" = NOW(), "lockedBy" = ${workerId}, "attempts" = "attempts" + 1
    WHERE "id" = (
      SELECT "id" FROM "edu"."Job"
      WHERE ("status" = 'PENDING' AND "runAt" <= NOW())
         OR ("status" = 'RUNNING' AND "lockedAt" < NOW() - ${LEASE_SECONDS}::double precision * INTERVAL '1 second' AND "attempts" < "maxAttempts")
      ORDER BY "runAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING "id", "type", "payload", "attempts", "maxAttempts", "createdBy"`;
  return rows[0] ?? null;
}

async function execute(job: JobRow, workerId: string): Promise<void> {
  const handler = registry.get(job.type);
  const started = Date.now();
  const log = logger.child({ jobId: job.id, jobType: job.type, attempt: job.attempts });
  const ctx: JobContext = { setProgress: async (p) => { await prisma.job.updateMany({ where: { id: job.id, lockedBy: workerId }, data: { progress: Math.max(0, Math.min(100, Math.round(p))) } }); } };
  try {
    if (!handler) throw new Error(`Chưa đăng ký handler cho job "${job.type}"`);
    const result = await handler(job, ctx);
    await prisma.job.updateMany({ where: { id: job.id, lockedBy: workerId }, data: { status: "DONE", progress: 100, result: result ?? Prisma.JsonNull, lastError: null, finishedAt: new Date(), lockedAt: null } });
    log.info({ ms: Date.now() - started }, "job_done");
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const final = job.attempts >= job.maxAttempts || !registry.has(job.type);
    const delay = BACKOFF_BASE_SECONDS * 2 ** (job.attempts - 1);
    await prisma.job.updateMany({
      where: { id: job.id, lockedBy: workerId },
      data: final
        ? { status: "FAILED", lastError: message, finishedAt: new Date(), lockedAt: null }
        : { status: "PENDING", lastError: message, runAt: new Date(Date.now() + delay * 1000), lockedAt: null },
    });
    log.warn({ err: error, final, ms: Date.now() - started }, final ? "job_failed" : "job_retry_scheduled");
    if (final) await reportError(error, { source: "job", route: job.type });
  }
}

export type RunSummary = { processed: number; remaining: boolean };

/** Xử lý các việc đến hạn trong tối đa budgetMs. Gọi từ cron, từ after() ngay sau khi enqueue, hoặc nút "Chạy ngay" ở /van-hanh. */
export async function runPending(budgetMs = 240_000): Promise<RunSummary> {
  const { ensureHandlers } = await import("./handlers");
  ensureHandlers();
  const workerId = `${process.env.VERCEL_REGION ?? "local"}-${randomUUID().slice(0, 8)}`;
  const deadline = Date.now() + budgetMs;
  await failExhaustedStale();
  let processed = 0;
  while (Date.now() < deadline) {
    const job = await claim(workerId);
    if (!job) return { processed, remaining: false };
    await execute(job, workerId);
    processed++;
  }
  return { processed, remaining: true };
}

/** Kích hoạt worker mà không chờ (dùng trong after()). Lỗi chỉ được ghi log. */
export const kick = () => runPending().catch((error) => logger.error({ err: error }, "job_kick_failed"));

/** Chạy worker ngay sau khi phản hồi người dùng (trong request). Ngoài ngữ cảnh request (test, script) thì bỏ qua: cron/lần kích hoạt sau sẽ nhặt việc. */
export function kickSoon() {
  try { after(() => kick()); } catch { /* không ở trong request */ }
}
