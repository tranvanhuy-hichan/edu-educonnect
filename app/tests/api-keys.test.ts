import assert from "node:assert/strict";
import { test } from "node:test";
import { SCOPE_LIST, normalizeScopes } from "../src/modules/apikeys/api-key.scopes";
import { ipAllowed, isValidAllowEntry } from "../src/modules/apikeys/ip";
import { extractKey, generateKey, hashKey, validateCreate } from "../src/modules/apikeys/api-key.service";
import { pageSchema, pageMeta } from "../src/modules/public-api/public-api.service";

test("scopes: unknown ones are rejected, extended scopes pull in their base scope, at least one is required", () => {
  assert.throws(() => normalizeScopes(["students:everything"]), /không hợp lệ/);
  assert.throws(() => normalizeScopes([]), /ít nhất một/);
  assert.deepEqual(normalizeScopes(["students:contact"]), ["students:read", "students:contact"]);
  assert.deepEqual(normalizeScopes(["teachers:contact", "grades:read"]), ["grades:read", "teachers:read", "teachers:contact"]);
  assert.deepEqual(normalizeScopes(["students:read", "students:read"]), ["students:read"]);
  assert.ok(SCOPE_LIST.includes("students:identity"));
});

test("IP allow-list supports exact IPv4/IPv6 and IPv4 CIDR, rejects malformed entries, and empty list means unrestricted", () => {
  for (const ok of ["1.2.3.4", "113.161.0.0/16", "10.0.0.0/8", "0.0.0.0/0", "2001:db8::1"]) assert.ok(isValidAllowEntry(ok), ok);
  for (const bad of ["", "1.2.3", "1.2.3.256", "1.2.3.4/33", "1.2.3.4/x", "abc", "1.2.3.4/8/8", "a.b.c.d"]) assert.equal(isValidAllowEntry(bad), false, bad);
  assert.equal(ipAllowed("9.9.9.9", []), true);
  assert.equal(ipAllowed("1.2.3.4", ["1.2.3.4"]), true);
  assert.equal(ipAllowed("1.2.3.5", ["1.2.3.4"]), false);
  assert.equal(ipAllowed("113.161.77.8", ["113.161.0.0/16"]), true);
  assert.equal(ipAllowed("113.162.0.1", ["113.161.0.0/16"]), false);
  assert.equal(ipAllowed("192.168.1.77", ["192.168.1.64/27"]), true);
  assert.equal(ipAllowed("192.168.1.100", ["192.168.1.64/27"]), false);
  assert.equal(ipAllowed("2001:DB8::1", ["2001:db8::1"]), true);
  assert.equal(ipAllowed("unknown", ["1.2.3.4"]), false);
});

test("generated keys are unguessable, well formed and stored only as a hash; the key is read from headers, never the URL", () => {
  const a = generateKey(), b = generateKey();
  assert.match(a, /^ek_[A-Za-z0-9_-]{32}$/);
  assert.notEqual(a, b);
  assert.match(hashKey(a), /^[0-9a-f]{64}$/);
  assert.equal(hashKey(a), hashKey(a));
  assert.notEqual(hashKey(a), hashKey(b));
  const req = (headers: Record<string, string>, url = "http://x/api/v1/me") => new Request(url, { headers });
  assert.equal(extractKey(req({ authorization: `Bearer ${a}` })), a);
  assert.equal(extractKey(req({ authorization: `bearer ${a}` })), a);
  assert.equal(extractKey(req({ "x-api-key": a })), a);
  assert.equal(extractKey(req({}, `http://x/api/v1/me?api_key=${a}&key=${a}`)), null, "khoá trên URL bị bỏ qua");
  assert.equal(extractKey(req({ authorization: "Basic abc" })), null);
});

test("key creation input is validated: name, IPs, rate limit and expiry", () => {
  const ok = validateCreate({ name: " Đoàn ", scopes: ["students:contact"], ipAllowlist: [" 1.2.3.4 ", "", "10.0.0.0/8"], rateLimitPerMin: 60, expiresInDays: 90 });
  assert.equal(ok.name, "Đoàn");
  assert.deepEqual(ok.scopes, ["students:read", "students:contact"]);
  assert.deepEqual(ok.ips, ["1.2.3.4", "10.0.0.0/8"]);
  assert.ok(ok.expiresAt && ok.expiresAt.getTime() > Date.now() + 89 * 86_400_000);
  assert.equal(validateCreate({ name: "ab", scopes: ["grades:read"] }).expiresAt, null);
  assert.throws(() => validateCreate({ name: "a", scopes: ["grades:read"] }), /Tên khoá/);
  assert.throws(() => validateCreate({ name: "ok", scopes: ["grades:read"], ipAllowlist: ["999.1.1.1"] }), /IP không hợp lệ/);
  assert.throws(() => validateCreate({ name: "ok", scopes: ["grades:read"], rateLimitPerMin: 5 }), /10 đến 1000/);
  assert.throws(() => validateCreate({ name: "ok", scopes: ["grades:read"], expiresInDays: 5000 }), /Thời hạn/);
});

test("pagination parameters default sensibly and reject out-of-range values", () => {
  assert.deepEqual(pageSchema.parse({}), { page: 1, pageSize: 50 });
  assert.deepEqual(pageSchema.parse({ page: "3", pageSize: "200" }), { page: 3, pageSize: 200 });
  for (const bad of [{ page: "0" }, { pageSize: "201" }, { pageSize: "0" }, { page: "abc" }, { pageSize: "1.5" }]) assert.throws(() => pageSchema.parse(bad));
  assert.deepEqual(pageMeta({ page: 2, pageSize: 50 }, 101), { page: 2, pageSize: 50, total: 101, totalPages: 3 });
  assert.equal(pageMeta({ page: 1, pageSize: 50 }, 0).totalPages, 1);
});
