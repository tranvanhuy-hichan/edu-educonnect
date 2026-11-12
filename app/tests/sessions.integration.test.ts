import { testAccount } from "./helpers/account";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { AccountLockedError, InvalidCredentialsError, login, resolveSessionIdentity, startSession } from "../src/modules/auth/auth.service";
import * as sessions from "../src/modules/auth/session.repository";
import { credentialTag } from "../src/lib/auth/credential-tag";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });

test("database: five wrong passwords lock the account for 15 minutes; a correct password during the lock is also refused; admin can unlock", { skip: !enabled }, async () => {
  process.env.JWT_SECRET ||= "test-secret-only";
  const email = `lock${Date.now().toString(36)}@test.invalid`;
  const user = await prisma.user.create({ data: { email, accountId: await testAccount(bcrypt.hashSync("Dung-mat-khau-1", 4)), roles: ["LIBRARIAN"] } });
  try {
    for (let i = 0; i < 4; i++) await assert.rejects(login({ email, password: "sai" }), InvalidCredentialsError);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLogins, 4);
    await assert.rejects(login({ email, password: "sai" }), AccountLockedError); // lần thứ 5
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(locked.lockedUntil && locked.lockedUntil.getTime() > Date.now() + 14 * 60_000);
    assert.equal(locked.failedLogins, 0);
    await assert.rejects(login({ email, password: "Dung-mat-khau-1" }), AccountLockedError, "đang khoá thì mật khẩu đúng cũng không vào được");
    assert.ok(await prisma.activityLog.findFirst({ where: { action: "login_locked", targetId: user.id } }));
    await prisma.$executeRaw`DELETE FROM "edu"."LoginThrottle"`;
    await sessions.clearLock(user.id);
    const ok = await login({ email, password: "Dung-mat-khau-1" });
    assert.equal(ok.userId, user.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(after.lastLoginAt);
    assert.equal(after.failedLogins, 0);
    // đăng nhập đúng giữa chừng xoá bộ đếm sai
    await assert.rejects(login({ email, password: "sai" }), InvalidCredentialsError);
    await login({ email, password: "Dung-mat-khau-1" });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLogins, 0);
  } finally {
    await prisma.activityLog.deleteMany({ where: { targetId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$executeRaw`DELETE FROM "edu"."LoginThrottle"`;
  }
});

test("database: devices can be listed and revoked one by one, others at once, or everywhere (including old tokens without a session id)", { skip: !enabled }, async () => {
  const user = await prisma.user.create({ data: { email: `sess${Date.now().toString(36)}@test.invalid`, accountId: await testAccount("hash-x"), roles: ["LIBRARIAN"] } });
  const tag = credentialTag("hash-x");
  const nowSec = () => Math.floor(Date.now() / 1000);
  try {
    const a = await startSession(user.id, "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537", "113.161.22.9");
    const b = await startSession(user.id, "Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604", "27.65.1.2");
    const c = await startSession(user.id, "Mozilla/5.0 (Linux; Android 14) Chrome/120", "1.2.3.4");
    const list = await sessions.listLiveSessions(user.id);
    assert.deepEqual(list.map((s) => s.device).sort(), ["Chrome trên Android", "Chrome trên Windows", "Safari trên iOS"]);
    assert.ok(list.every((s) => /\.\*\.\*$/.test(s.ipMasked)), "IP được che");
    assert.ok(await resolveSessionIdentity(user.id, tag, { sid: a, iat: nowSec() }));
    // thu hồi một thiết bị
    assert.equal((await sessions.revokeSession(b, user.id)).count, 1);
    assert.equal(await resolveSessionIdentity(user.id, tag, { sid: b, iat: nowSec() }), null);
    assert.ok(await resolveSessionIdentity(user.id, tag, { sid: a, iat: nowSec() }));
    assert.equal((await sessions.revokeSession(a, "nguoi-khac")).count, 0, "không thu hồi được phiên của người khác");
    // đăng xuất các thiết bị khác, giữ thiết bị này
    await sessions.revokeOtherSessions(user.id, a);
    assert.equal(await resolveSessionIdentity(user.id, tag, { sid: c, iat: nowSec() }), null);
    assert.ok(await resolveSessionIdentity(user.id, tag, { sid: a, iat: nowSec() }));
    // đăng xuất mọi nơi: phiên có mã, và cả token cũ không có mã phiên
    const oldIat = nowSec() - 5;
    await sessions.revokeEverywhere(user.id);
    assert.equal(await resolveSessionIdentity(user.id, tag, { sid: a, iat: nowSec() }), null, "phiên đã bị thu hồi");
    assert.equal(await resolveSessionIdentity(user.id, tag, { iat: oldIat }), null, "token cũ cấp trước mốc bị vô hiệu");
    // đăng nhập lại sau đó vẫn dùng được
    const fresh = await startSession(user.id, "Firefox/120 Linux", "5.6.7.8");
    assert.ok(await resolveSessionIdentity(user.id, tag, { sid: fresh, iat: nowSec() + 1 }));
    // không truyền meta (đường gọi cũ): hành vi như trước
    assert.ok(await resolveSessionIdentity(user.id, tag));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
