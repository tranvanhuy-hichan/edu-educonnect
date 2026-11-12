import assert from "node:assert/strict";
import { test } from "node:test";
import { maskPhone, toAscii, toVnMobile } from "../src/modules/sms/phone";
import { currentProvider, esmsProvider, isSmsEnabled } from "../src/modules/sms/provider";
import { groupNoticeSms, smsEventEnabled } from "../src/modules/sms/sms.service";
import { parentGate, validateNewParentPassword } from "../src/modules/parent/parent-auth.service";

const env = (extra: Record<string, string> = {}) => ({ NODE_ENV: "test", ...extra }) as NodeJS.ProcessEnv;
const keys = { ESMS_API_KEY: "k", ESMS_SECRET_KEY: "s" };

test("Vietnamese mobile numbers normalise from any common format; landlines, short and foreign numbers are rejected", () => {
  for (const raw of ["0912345678", "0912 345 678", "091.234.5678", "+84 912 345 678", "84912345678", "912345678"]) assert.equal(toVnMobile(raw), "0912345678", raw);
  assert.equal(toVnMobile("0381234567"), "0381234567");
  for (const raw of ["", null, "123", "0212345678", "02838123456", "+1 202 555 0100", "09123456789", "abc"]) assert.equal(toVnMobile(raw as string | null), null, String(raw));
  assert.equal(maskPhone("0912345678"), "091****678");
});

test("SMS text is stripped of diacritics so it stays one 160-character message", () => {
  assert.equal(toAscii("Em Nguyễn Đức Anh vắng tiết 3 môn Toán"), "Em Nguyen Duc Anh vang tiet 3 mon Toan");
  assert.equal(toAscii("Điểm — “tốt” ✓"), "Diem tot");
});

test("eSMS request matches the REST v4 contract and every outcome is mapped without throwing", async () => {
  const calls: { url: string; body: Record<string, string> }[] = [];
  const reply = (data: unknown, status = 200) => (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return new Response(JSON.stringify(data), { status }); }) as typeof fetch;

  const ok = await esmsProvider(env({ ...keys, SMS_SANDBOX: "1", ESMS_BRANDNAME: "SONHA", ESMS_SMS_TYPE: "2" }), reply({ CodeResult: "100", SMSID: "abc123" })).send("0912345678", "Xin chao");
  assert.deepEqual(ok, { ok: true, code: "100", ref: "abc123" });
  assert.match(calls[0].url, /rest\.esms\.vn\/MainService\.svc\/json\/SendMultipleMessage_V4_post_json\/$/);
  assert.deepEqual(calls[0].body, { ApiKey: "k", SecretKey: "s", Phone: "0912345678", Content: "Xin chao", SmsType: "2", IsUnicode: "0", Sandbox: "1", Brandname: "SONHA" });

  await esmsProvider(env(keys), reply({ CodeResult: "100" })).send("0912345678", "x");
  assert.equal(calls[1].body.SmsType, "8");
  assert.equal(calls[1].body.Sandbox, "0");
  assert.equal("Brandname" in calls[1].body, false);

  const noMoney = await esmsProvider(env(keys), reply({ CodeResult: "103" })).send("0912345678", "x");
  assert.equal(noMoney.ok, false);
  assert.match(noMoney.error!, /không đủ tiền/);
  assert.match((await esmsProvider(env(keys), reply({ CodeResult: "101" })).send("0912345678", "x")).error!, /Sai ApiKey/);
  assert.match((await esmsProvider(env(keys), reply({ CodeResult: "555", ErrorMessage: "Lỗi lạ" })).send("0912345678", "x")).error!, /Lỗi lạ/);
  assert.equal((await esmsProvider(env(keys), reply({}, 502)).send("0912345678", "x")).code, "HTTP502");
  const down = await esmsProvider(env(keys), (async () => { throw new TypeError("fetch failed"); }) as typeof fetch).send("0912345678", "x");
  assert.deepEqual([down.ok, down.code], [false, "NETWORK"]);
  const slow = await esmsProvider(env(keys), (async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; }) as typeof fetch).send("0912345678", "x");
  assert.equal(slow.code, "TIMEOUT");
});

test("SMS is enabled only when provider keys exist; the dev log provider is blocked in production", () => {
  assert.equal(isSmsEnabled(env()), false);
  assert.equal(isSmsEnabled(env({ ESMS_API_KEY: "k" })), false);
  assert.equal(currentProvider(env(keys))?.name, "esms");
  assert.equal(currentProvider(env({ SMS_PROVIDER: "log" }))?.name, "log");
  assert.equal(currentProvider(env({ SMS_PROVIDER: "log", NODE_ENV: "production" })), null);
});

test("event filter: all events by default, only listed ones when SMS_EVENTS is set, none when SMS is off", () => {
  assert.equal(smsEventEnabled("absence", env(keys)), true);
  assert.equal(smsEventEnabled("score_changed", env({ ...keys, SMS_EVENTS: "absence, grades_published" })), false);
  assert.equal(smsEventEnabled("absence", env({ ...keys, SMS_EVENTS: "absence, grades_published" })), true);
  assert.equal(smsEventEnabled("absence", env()), false);
});

test("notice SMS is merged per phone: one message per parent, summarising siblings", () => {
  const out = groupNoticeSms([
    { phone: "0912 345 678", text: "Em A vang", childName: "A" },
    { phone: "+84912345678", text: "Em B vang", childName: "B" },
    { phone: "0987654321", text: "Em C vang", childName: "C" },
    { phone: "khong co", text: "x", childName: "D" },
  ], "THPT Son Ha");
  assert.equal(out.length, 2);
  assert.equal(out.find((m) => m.phone === "0987654321")!.text, "Em C vang");
  assert.match(out.find((m) => m.phone === "0912345678")!.text, /^\[THPT Son Ha\] Co 2 thong bao moi cho A, B\./);
  assert.ok(out.every((m) => m.text.length <= 160));
});

test("parent gate: verify first (only when SMS is on), then forced password change", () => {
  const acc = (verified: boolean, must: boolean) => ({ phoneVerifiedAt: verified ? new Date() : null, mustChangePwd: must });
  assert.equal(parentGate(acc(false, false), true), "verify");
  assert.equal(parentGate(acc(false, true), true), "verify", "xác minh trước, đổi mật khẩu sau");
  assert.equal(parentGate(acc(true, true), true), "password");
  assert.equal(parentGate(acc(true, false), true), null);
  assert.equal(parentGate(acc(false, false), false), null, "SMS tắt: hành vi cũ");
  assert.equal(parentGate(acc(false, true), false), "password");
});

test("new parent passwords reject short, trivial and phone-number passwords", () => {
  assert.ok(validateNewParentPassword("abc123", "0912345678"));
  assert.ok(validateNewParentPassword("12345678", "0912345678"));
  assert.ok(validateNewParentPassword("aaaaaaaa", "0912345678"));
  assert.ok(validateNewParentPassword("0912345678", "0912345678"));
  assert.ok(validateNewParentPassword("MatKhau123", "0912345678"), "danh sách mật khẩu dễ đoán không phân biệt hoa thường");
  assert.equal(validateNewParentPassword("Tot-Hon-2026", "0912345678"), null);
});
