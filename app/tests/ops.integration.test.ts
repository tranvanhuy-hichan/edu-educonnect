import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { enqueue, registerJob, runPending } from "../src/lib/jobs/queue";
import { rateLimit } from "../src/lib/rate-limit";
import { reportError } from "../src/lib/observability/report-error";
import { observe } from "../src/lib/observability/observe";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });
const cleanup = () => prisma.job.deleteMany({ where: { type: { startsWith: "test." } } });

test("database: job queue dedupes, runs once under parallel workers and records results", { skip: !enabled }, async () => {
  await cleanup();
  let runs = 0;
  registerJob("test.count", async (_job, ctx) => { runs++; await ctx.setProgress(50); await new Promise((r) => setTimeout(r, 20)); return { ok: true }; });
  const first = await enqueue("test.count", { n: 0 }, { dedupeKey: "test:dedupe" });
  assert.equal((await enqueue("test.count", { n: 0 }, { dedupeKey: "test:dedupe" })).id, first.id);
  for (let i = 1; i < 6; i++) await enqueue("test.count", { n: i });
  await Promise.all([runPending(5000), runPending(5000), runPending(5000)]);
  assert.equal(runs, 6);
  const rows = await prisma.job.findMany({ where: { type: "test.count" } });
  assert.ok(rows.every((j) => j.status === "DONE" && j.attempts === 1 && j.progress === 100));
  await cleanup();
});

test("database: failed jobs back off and retry, then fail permanently and surface in ErrorLog; stale leases are reclaimed", { skip: !enabled }, async () => {
  await cleanup();
  let calls = 0;
  registerJob("test.flaky", async () => { calls++; throw new Error("boom 42"); });
  const job = await enqueue("test.flaky", {}, { maxAttempts: 2 });
  await runPending(5000);
  let row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(row.status, "PENDING");
  assert.equal(row.attempts, 1);
  assert.ok(row.runAt.getTime() > Date.now() + 20_000, "backoff delays the retry");
  assert.equal((await runPending(5000)).processed, 0, "not due yet");
  await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
  await runPending(5000);
  row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(row.status, "FAILED");
  assert.equal(calls, 2);
  assert.ok(await prisma.errorLog.findFirst({ where: { source: "job", route: "test.flaky" } }));

  let ran = 0;
  registerJob("test.stale", async () => { ran++; });
  const stale = await enqueue("test.stale", {});
  await prisma.job.update({ where: { id: stale.id }, data: { status: "RUNNING", attempts: 1, lockedAt: new Date(Date.now() - 3600_000), lockedBy: "dead-worker" } });
  await runPending(5000);
  assert.equal(ran, 1);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: stale.id } })).status, "DONE");
  const exhausted = await enqueue("test.stale", {}, { maxAttempts: 1 });
  await prisma.job.update({ where: { id: exhausted.id }, data: { status: "RUNNING", attempts: 1, lockedAt: new Date(Date.now() - 3600_000) } });
  await runPending(5000);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: exhausted.id } })).status, "FAILED");
  assert.equal(ran, 1, "exhausted job is not re-run");
  await cleanup();
  await prisma.errorLog.deleteMany({ where: { route: "test.flaky" } });
});

test("database: rate limiter blocks after the limit per identifier and reports Retry-After", { skip: !enabled }, async () => {
  const id = `u-${Date.now()}`;
  const rule = { limit: 3, windowSec: 60 };
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await rateLimit("test", id, rule));
  assert.deepEqual(results.map((r) => r.ok), [true, true, true, false]);
  assert.ok(results[3].retryAfterSec > 0 && results[3].retryAfterSec <= 60);
  assert.equal((await rateLimit("test", `${id}-other`, rule)).ok, true);
  assert.equal((await rateLimit("test-other-scope", id, rule)).ok, true);
});

test("database: reportError groups repeats into one row and observe() turns throws into 500 with requestId", { skip: !enabled }, async () => {
  await prisma.errorLog.deleteMany({ where: { route: { startsWith: "/test-ops" } } });
  await reportError(new Error("db exploded 1"), { source: "route", route: "/test-ops/a" });
  await reportError(new Error("db exploded 2"), { source: "route", route: "/test-ops/a" });
  const rows = await prisma.errorLog.findMany({ where: { route: "/test-ops/a" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 2);
  await prisma.errorLog.update({ where: { id: rows[0].id }, data: { status: "RESOLVED" } });
  await reportError(new Error("db exploded 3"), { source: "route", route: "/test-ops/a" });
  assert.equal((await prisma.errorLog.findUniqueOrThrow({ where: { id: rows[0].id } })).status, "OPEN", "a recurrence reopens the error");

  const handler = observe(async (_request: Request) => { throw new Error("handler failed"); });
  const response = await handler(new Request("http://localhost/test-ops/b", { headers: { "x-request-id": "req-test-12345" } }));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("x-request-id"), "req-test-12345");
  assert.deepEqual(await response.json(), { error: "Lỗi hệ thống", requestId: "req-test-12345" });
  const logged = await prisma.errorLog.findFirstOrThrow({ where: { route: "/test-ops/b" } });
  assert.equal(logged.requestId, "req-test-12345");
  await prisma.errorLog.deleteMany({ where: { route: { startsWith: "/test-ops" } } });
});
