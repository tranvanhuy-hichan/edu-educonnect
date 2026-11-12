import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runPending } from "@/lib/jobs/queue";
import { enqueue } from "@/lib/jobs/queue";
import { observe } from "@/lib/observability/observe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Worker hàng đợi. Vercel Cron gọi (kèm Authorization: Bearer CRON_SECRET) hoặc bất kỳ bộ lập lịch ngoài nào.
 * ?cleanup=1 thêm việc dọn dẹp định kỳ trước khi chạy. Không có CRON_SECRET → từ chối mọi yêu cầu.
 */
export const GET = observe(async (request: Request) => {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (new URL(request.url).searchParams.get("cleanup") === "1") {
    await enqueue("maintenance.cleanup", {}, { dedupeKey: `cleanup:${new Date().toISOString().slice(0, 10)}`, maxAttempts: 1 });
  }
  return NextResponse.json(await runPending());
});
