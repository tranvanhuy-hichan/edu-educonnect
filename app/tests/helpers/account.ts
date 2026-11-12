import { after } from "node:test";
import { randomBytes } from "node:crypto";
import { prisma } from "../../src/lib/prisma";

/**
 * Kiểm thử tích hợp chạy trên DB dùng chung với Cổng Đoàn: mọi người dùng EduConnect cần một tài khoản ở public."User".
 * Tài khoản thử có tên đăng nhập bắt đầu bằng "zz-test-" và được dọn sau khi chạy (chỉ xoá những tài khoản KHÔNG còn hồ sơ EduConnect).
 */
const PREFIX = "zz-test-";

export async function testAccount(passwordHash = "test-only", role: "EXTERNAL" | "MEMBER" = "EXTERNAL"): Promise<string> {
  const a = await prisma.doanUser.create({
    data: { username: `${PREFIX}${randomBytes(6).toString("hex")}`, passwordHash, fullName: "Tài khoản kiểm thử", role, mustChangePassword: false },
    select: { id: true },
  });
  return a.id;
}

/** Mật khẩu (đã băm) của tài khoản gắn với một người dùng EduConnect. */
export async function passwordHashOf(userId: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { account: { select: { passwordHash: true } } } })).account.passwordHash;
}

export async function setPasswordHashOf(userId: string, passwordHash: string): Promise<void> {
  const { accountId } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { accountId: true } });
  await prisma.doanUser.update({ where: { id: accountId }, data: { passwordHash } });
}

export async function cleanupTestAccounts(): Promise<number> {
  return prisma.$executeRaw`DELETE FROM public."User" u WHERE u.username LIKE ${PREFIX + "%"} AND NOT EXISTS (SELECT 1 FROM edu."User" e WHERE e."accountId" = u.id)`;
}

after(async () => { await cleanupTestAccounts().catch(() => undefined); });
