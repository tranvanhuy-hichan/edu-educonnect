import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { fingerprintOf } from "../src/lib/observability/report-error";
import { validateEnv } from "../src/lib/env";
import { buildOpenApi } from "../src/lib/openapi/spec";
import { proxy } from "../src/proxy";

test("error fingerprint groups the same failure but separates different routes and kinds", () => {
  const a = fingerprintOf(new Error("Record ckabcdefghijklmnopqrstu not found (attempt 3)"), { source: "route", route: "/api/x" });
  const b = fingerprintOf(new Error("Record clzzzzzzzzzzzzzzzzzzzzz not found (attempt 9)"), { source: "route", route: "/api/x" });
  assert.equal(a, b);
  assert.notEqual(a, fingerprintOf(new Error("Record ckabcdefghijklmnopqrstu not found (attempt 3)"), { source: "route", route: "/api/y" }));
  assert.notEqual(a, fingerprintOf(new TypeError("Record ckabcdefghijklmnopqrstu not found (attempt 3)"), { source: "route", route: "/api/x" }));
});

test("environment validation reports missing required settings and refuses to boot production without them", () => {
  assert.deepEqual(validateEnv({ NODE_ENV: "development", DATABASE_URL: "postgres://x", JWT_SECRET: "s" } as NodeJS.ProcessEnv), []);
  assert.ok(validateEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv).length >= 2);
  assert.throws(() => validateEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv), /Cấu hình không hợp lệ/);
  assert.doesNotThrow(() => validateEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" } as NodeJS.ProcessEnv));
  assert.ok(validateEnv({ NODE_ENV: "development", DATABASE_URL: "x", JWT_SECRET: "s", CRON_SECRET: "short" } as NodeJS.ProcessEnv).some((p) => /CRON_SECRET/.test(p)));
});

test("OpenAPI document is generated from the live Zod login schema", () => {
  const spec = buildOpenApi();
  assert.equal(spec.openapi, "3.1.0");
  const login = spec.paths["/api/auth/login"].post.requestBody.content["application/json"].schema as { required: string[]; properties: Record<string, unknown> };
  assert.deepEqual([...login.required].sort(), ["email", "password"]);
  for (const path of ["/api/uploads", "/api/imports", "/api/health", "/api/ready", "/api/jobs/run"]) assert.ok(spec.paths[path as keyof typeof spec.paths], path);
});

test("proxy issues a request id, keeps a sane inbound one and rejects log-injection attempts", () => {
  const fresh = proxy(new NextRequest("http://localhost/x"));
  assert.match(fresh.headers.get("x-request-id")!, /^[0-9a-f-]{36}$/);
  assert.equal(proxy(new NextRequest("http://localhost/x", { headers: { "x-request-id": "abc-12345678" } })).headers.get("x-request-id"), "abc-12345678");
  assert.notEqual(proxy(new NextRequest("http://localhost/x", { headers: { "x-request-id": "bad id; forged=1" } })).headers.get("x-request-id"), "bad id; forged=1");
});
