"use server";
import { revalidatePath } from "next/cache";
import { assertRole, ADMIN_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { runPending } from "@/lib/jobs/queue";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const runQueueNow = wrap(async () => {
  const me = await assertRole(...ADMIN_ROLES);
  const rl = await rateLimit("run-queue", me.id, LIMITS.jobsTrigger);
  if (!rl.ok) throw new Error("Thao tác quá nhanh, thử lại sau ít giây");
  const r = await runPending(50_000);
  revalidatePath("/van-hanh");
  return `Đã xử lý ${r.processed} việc${r.remaining ? ", còn việc chờ" : ""}`;
});

export const retryJob = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  const n = await db.job.updateMany({ where: { id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, runAt: new Date(), lastError: null, finishedAt: null, lockedAt: null } });
  if (!n.count) throw new Error("Chỉ thử lại được việc đã thất bại");
  await audit(me.email, "retry_job", "Job", id);
  revalidatePath("/van-hanh");
  return "Đã xếp lại vào hàng đợi";
});

export const resolveError = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  await db.errorLog.update({ where: { id }, data: { status: "RESOLVED" } });
  await audit(me.email, "resolve_error", "ErrorLog", id);
  revalidatePath("/van-hanh");
  return "Đã đánh dấu đã xử lý";
});
