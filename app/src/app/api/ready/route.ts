import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { observe } from "@/lib/observability/observe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { ok: boolean; ms?: number; detail?: string };

async function timed(fn: () => Promise<string | void>): Promise<Check> {
  const t = performance.now();
  try { const detail = await fn(); return { ok: true, ms: Math.round(performance.now() - t), ...(detail ? { detail } : {}) }; }
  catch (error) { logger.error({ err: error }, "readiness_check_failed"); return { ok: false, ms: Math.round(performance.now() - t) }; }
}

/**
 * Readiness: sẵn sàng phục vụ người dùng chưa? Kiểm tra DB trả lời được, mọi migration đã áp dụng (chặn lỗi P2022 sau khi deploy
 * code mới trước DB) và cấu hình kho tệp. 503 khi có mục lỗi. Thêm ?detail=1 kèm header x-health-token (HEALTH_TOKEN) để xem chi tiết.
 */
export const GET = observe(async (request: Request) => {
  const db = await timed(async () => { await prisma.$queryRaw`SELECT 1`; });
  const migrations = db.ok ? await timed(async () => {
    const [exists] = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS ok`;
    if (!exists.ok) return "không có lịch sử migration (DB dựng bằng db push hoặc chưa baseline)";
    const [row] = await prisma.$queryRaw<{ pending: number }[]>`SELECT COUNT(*)::int AS pending FROM "_prisma_migrations" WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL`;
    if (row.pending > 0) throw new Error(`${row.pending} migration đang dở`);
  }) : { ok: false };
  const storage: Check = { ok: !!(process.env.STORAGE_PROVIDER === "minio" ? process.env.MINIO_ENDPOINT : process.env.CLOUDINARY_CLOUD_NAME) };
  const ok = db.ok && migrations.ok && storage.ok;
  const token = process.env.HEALTH_TOKEN;
  const detailed = token && request.headers.get("x-health-token") === token;
  return NextResponse.json(detailed ? { status: ok ? "ready" : "degraded", checks: { database: db, migrations, storage } } : { status: ok ? "ready" : "degraded" }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
});
