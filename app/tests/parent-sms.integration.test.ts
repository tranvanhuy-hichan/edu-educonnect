import { testAccount } from "./helpers/account";
import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { runPending } from "../src/lib/jobs/queue";
import { setSmsProvider, type SmsProvider } from "../src/modules/sms/provider";
import { sendSms } from "../src/modules/sms/sms.service";
import { notifyGuardians } from "../src/modules/notification/parent-notification.service";
import { completeVerification, parentGate, requestParentOtp, resolveGuardian, setInitialParentPassword, verifyParentOtp } from "../src/modules/parent/parent-auth.service";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { setSmsProvider(null); await prisma.$disconnect(); });
afterEach(() => { setSmsProvider(null); delete process.env.SMS_PHONE_DAILY_LIMIT; });

const sent: { to: string; content: string }[] = [];
const fake = (result: { ok: boolean; code?: string; error?: string } = { ok: true }): SmsProvider => ({ name: "fake", async send(to, content) { sent.push({ to, content }); return { ok: result.ok, code: result.code ?? (result.ok ? "100" : "103"), error: result.error, ref: "r1" }; } });
const rnd = () => String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
const newPhone = () => `09${rnd()}`;
const codeOf = (content: string) => content.match(/\b(\d{6})\b/)![1];

async function makeStudent(phone: string | null, name = "Hoc Sinh Thu") {
  const tag = `sms${Date.now().toString(36)}${rnd()}`;
  const u = await prisma.user.create({ data: { email: `${tag}@test.invalid`, accountId: await testAccount("x"), roles: ["STUDENT"], student: { create: { fullName: name, code: `HS${tag}`.toUpperCase().slice(0, 14), guardianPhone: phone, guardianName: "Phu huynh thu" } } }, include: { student: true } });
  return { user: u, student: u.student! };
}
const cleanupPhone = async (phone: string) => {
  const key = phone.slice(-9);
  await prisma.parentOtp.deleteMany({ where: { phoneKey: key } });
  await prisma.parentAccount.deleteMany({ where: { phone: { endsWith: key } } });
  await prisma.parentNotification.deleteMany({ where: { phoneKey: key } });
};
const dropStudent = async (s: Awaited<ReturnType<typeof makeStudent>>) => { await prisma.student.delete({ where: { id: s.student.id } }); await prisma.user.delete({ where: { id: s.user.id } }); };

test("database: OTP is sent once per cooldown, stored hashed, single-use, locked after 5 wrong tries, and never reveals unknown numbers", { skip: !enabled }, async () => {
  const phone = newPhone(); const ip = `ip-${rnd()}`;
  const st = await makeStudent(phone);
  try {
    // SMS tắt → từ chối rõ ràng
    assert.equal((await requestParentOtp(phone, ip)).ok, false);
    sent.length = 0; setSmsProvider(fake());
    // số lạ: trả lời như đã gửi nhưng không gửi gì
    const unknown = await requestParentOtp(newPhone(), ip);
    assert.deepEqual(unknown, { ok: true });
    assert.equal(sent.length, 0);
    // số thật: gửi đúng một tin, có mã 6 số, ASCII
    const r = await requestParentOtp(phone, ip);
    assert.equal(r.ok && r.sentTo, `${phone.slice(0, 3)}****${phone.slice(-3)}`);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, phone);
    assert.match(sent[0].content, /^Ma xac minh So lien lac dien tu: \d{6}\./);
    const code = codeOf(sent[0].content);
    const row = await prisma.parentOtp.findFirstOrThrow({ where: { phoneKey: phone.slice(-9) } });
    assert.ok(!JSON.stringify(row).includes(code), "mã không được lưu rõ");
    const log = await prisma.smsLog.findFirstOrThrow({ where: { purpose: "OTP", phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-3)}` }, orderBy: { createdAt: "desc" } });
    assert.ok(!JSON.stringify(log).includes(phone) && !JSON.stringify(log).includes(code), "nhật ký không có số rõ hoặc mã");
    // gửi lại trong 1 phút bị chặn
    const again = await requestParentOtp(phone, ip);
    assert.equal(again.ok, false);
    // sai mã
    const wrong = code === "123456" ? "654321" : "123456";
    assert.equal((await verifyParentOtp(phone, wrong, ip)).ok, false);
    assert.equal((await verifyParentOtp(phone, "12ab56", ip)).ok, false);
    // đúng mã → ok, dùng lại thì không
    const ok = await verifyParentOtp(phone, code, ip);
    assert.equal(ok.ok, true);
    assert.equal((await verifyParentOtp(phone, code, ip)).ok, false, "mã chỉ dùng một lần");

    // khoá sau 5 lần sai, kể cả khi sau đó nhập đúng
    await prisma.parentOtp.deleteMany({ where: { phoneKey: phone.slice(-9) } });
    const fresh = `ip-${rnd()}`;
    await prisma.$executeRaw`DELETE FROM "edu"."LoginThrottle"`;
    assert.equal((await requestParentOtp(phone, fresh)).ok, true);
    const code2 = codeOf(sent[sent.length - 1].content);
    const bad = code2 === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i++) assert.equal((await verifyParentOtp(phone, bad, fresh)).ok, false);
    assert.equal((await verifyParentOtp(phone, code2, fresh)).ok, false, "đã sai 5 lần thì vô hiệu");

    // hết hạn
    await prisma.$executeRaw`DELETE FROM "edu"."LoginThrottle"`;
    assert.equal((await requestParentOtp(phone, `ip-${rnd()}`)).ok, true);
    const code3 = codeOf(sent[sent.length - 1].content);
    await prisma.parentOtp.updateMany({ where: { phoneKey: phone.slice(-9), consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await verifyParentOtp(phone, code3, `ip-${rnd()}`)).ok, false);

    // nhà cung cấp lỗi → báo lỗi, huỷ mã, ghi FAILED
    await prisma.$executeRaw`DELETE FROM "edu"."LoginThrottle"`;
    setSmsProvider(fake({ ok: false, code: "103", error: "Tài khoản eSMS không đủ tiền" }));
    const failed = await requestParentOtp(phone, `ip-${rnd()}`);
    assert.equal(failed.ok, false);
    assert.equal(await prisma.parentOtp.count({ where: { phoneKey: phone.slice(-9), consumedAt: null, expiresAt: { gt: new Date() } } }), 0);
    assert.ok(await prisma.smsLog.findFirst({ where: { status: "FAILED", providerCode: "103" } }));
  } finally { await cleanupPhone(phone); await dropStudent(st); }
});

test("database: first login by SMS creates a verified account that must set a strong password before anything else", { skip: !enabled }, async () => {
  const phone = newPhone(); const ip = `ip-${rnd()}`;
  const st = await makeStudent(phone);
  try {
    sent.length = 0; setSmsProvider(fake());
    assert.equal((await requestParentOtp(phone, ip)).ok, true);
    const v = await verifyParentOtp(phone, codeOf(sent[0].content), ip);
    assert.ok(v.ok);
    if (!v.ok) return;
    const acc = await completeVerification(v.guardian, true);
    assert.ok(acc.phoneVerifiedAt);
    assert.equal(acc.mustChangePwd, true);
    assert.equal(parentGate(acc), "password");
    // mật khẩu tạm ngẫu nhiên: 123456 không vào được
    assert.equal(await bcrypt.compare("123456", acc.passwordHash), false);
    assert.ok((await setInitialParentPassword(acc.id, "abc")).ok === false);
    assert.ok((await setInitialParentPassword(acc.id, "12345678")).ok === false);
    assert.ok((await setInitialParentPassword(acc.id, phone)).ok === false);
    assert.equal((await setInitialParentPassword(acc.id, "Mat-khau-moi-2026")).ok, true);
    const after = await prisma.parentAccount.findUniqueOrThrow({ where: { id: acc.id } });
    assert.equal(parentGate(after), null);
    assert.ok(await bcrypt.compare("Mat-khau-moi-2026", after.passwordHash));
    assert.notEqual(after.passwordHash, acc.passwordHash, "mã thông hành cũ hết hiệu lực");
    // quên mật khẩu: OTP lại → bắt đặt mật khẩu mới nhưng không tạo tài khoản thứ hai
    await prisma.$executeRaw`DELETE FROM "edu"."LoginThrottle"`;
    assert.equal((await requestParentOtp(phone, ip)).ok, true);
    const v2 = await verifyParentOtp(phone, codeOf(sent[sent.length - 1].content), ip);
    assert.ok(v2.ok);
    if (v2.ok) { const acc2 = await completeVerification(v2.guardian, true); assert.equal(acc2.id, acc.id); assert.equal(parentGate(acc2), "password"); }
    assert.equal(await prisma.parentAccount.count({ where: { phone: { endsWith: phone.slice(-9) } } }), 1);
  } finally { await cleanupPhone(phone); await dropStudent(st); }
});

test("database: legacy accounts must verify their phone once when SMS is on; nothing changes when SMS is off", { skip: !enabled }, async () => {
  const phone = newPhone(); const ip = `ip-${rnd()}`;
  const st = await makeStudent(phone);
  try {
    const legacy = await prisma.parentAccount.create({ data: { phone, fullName: "PH cu", passwordHash: await bcrypt.hash("Mat-khau-cu-1", 4) } });
    assert.equal(parentGate(legacy, false), null, "SMS tắt: vào như cũ");
    assert.equal(parentGate(legacy, true), "verify", "SMS bật: phải xác minh");
    sent.length = 0; setSmsProvider(fake());
    assert.equal((await requestParentOtp(phone, ip)).ok, true);
    const v = await verifyParentOtp(phone, codeOf(sent[0].content), ip);
    assert.ok(v.ok);
    if (v.ok) {
      const acc = await completeVerification(v.guardian, false); // đã biết mật khẩu: không ép đổi
      assert.equal(parentGate(acc, true), null);
    }
    const g = await resolveGuardian(st.student.code!);
    assert.equal(g?.validMobile, phone, "tìm bằng mã học sinh ra đúng số người giám hộ");
  } finally { await cleanupPhone(phone); await dropStudent(st); }
});

test("database: notice SMS is queued, ASCII, merged per phone, capped per phone and skipped for invalid numbers", { skip: !enabled }, async () => {
  const phone = newPhone();
  const a = await makeStudent(phone, "Nguyễn Văn A"), b = await makeStudent(phone, "Nguyễn Văn B"), c = await makeStudent("khong-co", "Trần C");
  const solo = newPhone(); const d = await makeStudent(solo, "Lê Thị D");
  const students = [a, b, c, d].map((x) => ({ id: x.student.id, fullName: x.student.fullName, guardianPhone: x.student.guardianPhone }));
  const startedAt = new Date();
  try {
    sent.length = 0; setSmsProvider(fake());
    const res = await notifyGuardians(students, (s) => ({ title: "Vắng", content: "vắng", type: "ATTENDANCE", sms: `[Truong] Em ${s.fullName} vắng tiết 2 môn Toán.` }), { smsEvent: "absence", school: "Trường THPT Sơn Hà" });
    assert.equal(res.sent, 3, "thông báo trong ứng dụng cho 3 em có số hợp lệ cách viết");
    assert.equal(res.sms, 2, "hai phụ huynh = hai tin (anh chị em gộp một tin)");
    assert.equal(sent.length, 0, "chưa gửi ngay: đi qua hàng đợi");
    await runPending(10_000);
    assert.equal(sent.length, 2);
    const merged = sent.find((m) => m.to === phone)!;
    assert.match(merged.content, /^\[Truong THPT Son Ha\] Co 2 thong bao moi cho Nguyen Van A, Nguyen Van B\./);
    const single = sent.find((m) => m.to === solo)!;
    assert.equal(single.content, "[Truong] Em Le Thi D vang tiet 2 mon Toan.");
    assert.ok(sent.every((m) => /^[\x20-\x7E]+$/.test(m.content) && m.content.length <= 160));

    // hạn mức thông báo/số/ngày: đặt 1, số solo đã nhận 1 → tin thứ hai bị bỏ qua
    process.env.SMS_PHONE_DAILY_LIMIT = "1";
    sent.length = 0;
    await notifyGuardians([students[3]], () => ({ title: "t", content: "c", type: "SYSTEM", sms: "[Truong] lan hai" }), { smsEvent: "absence" });
    await runPending(10_000);
    assert.equal(sent.length, 0);
    assert.ok(await prisma.smsLog.findFirst({ where: { status: "SKIPPED", error: { contains: "đủ số tin" }, createdAt: { gte: startedAt } } }));

    // sự kiện không nằm trong SMS_EVENTS → không gửi SMS nhưng vẫn có thông báo trong ứng dụng
    delete process.env.SMS_PHONE_DAILY_LIMIT;
    process.env.ESMS_API_KEY = "k"; process.env.ESMS_SECRET_KEY = "s"; process.env.SMS_EVENTS = "grades_published"; setSmsProvider(null);
    const off = await notifyGuardians([students[3]], () => ({ title: "t", content: "c", type: "SYSTEM", sms: "x" }), { smsEvent: "absence" });
    assert.deepEqual([off.sent, off.sms], [1, 0]);
    delete process.env.ESMS_API_KEY; delete process.env.ESMS_SECRET_KEY; delete process.env.SMS_EVENTS;

    // số không hợp lệ: không gọi nhà cung cấp, ghi SKIPPED
    setSmsProvider(fake()); sent.length = 0;
    assert.equal((await sendSms("NOTICE", "0212345678", "x")).status, "SKIPPED");
    assert.equal(sent.length, 0);
    // nhà cung cấp lỗi liên tiếp → dừng lô để khỏi gọi vô ích
    setSmsProvider(fake({ ok: false, code: "103" }));
    const many = Array.from({ length: 8 }, () => ({ phone: newPhone(), text: "x" }));
    const { enqueue } = await import("../src/lib/jobs/queue");
    await enqueue("sms.send", { items: many }, { maxAttempts: 1 });
    sent.length = 0;
    await runPending(10_000);
    assert.equal(sent.length, 5, "5 lỗi liên tiếp thì dừng, 3 tin còn lại không gọi nhà cung cấp");
  } finally {
    setSmsProvider(null);
    await prisma.job.deleteMany({ where: { type: "sms.send", createdAt: { gte: startedAt } } });
    await prisma.smsLog.deleteMany({ where: { createdAt: { gte: startedAt } } });
    for (const p of [phone, solo]) await cleanupPhone(p);
    for (const x of [a, b, c, d]) await dropStudent(x);
  }
});
