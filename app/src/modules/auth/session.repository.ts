import { prisma } from "@/lib/prisma";

/** Token sống 7 ngày; phiên cũ hơn thế đã tự hết hạn nên không hiển thị. */
export const SESSION_TTL_MS = 7 * 86_400_000;
const live = () => ({ revokedAt: null, createdAt: { gt: new Date(Date.now() - SESSION_TTL_MS) } });

export const createSession = (userId: string, device: string, ipMasked: string) => prisma.userSession.create({ data: { userId, device, ipMasked } });
export const findSession = (id: string) => prisma.userSession.findUnique({ where: { id } });
export const touchSession = (id: string) => prisma.userSession.update({ where: { id }, data: { lastSeenAt: new Date() } });
export const listLiveSessions = (userId: string) => prisma.userSession.findMany({ where: { userId, ...live() }, orderBy: { lastSeenAt: "desc" } });
export const revokeSession = (id: string, userId: string) => prisma.userSession.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
export const revokeOtherSessions = (userId: string, keepId: string | null) => prisma.userSession.updateMany({ where: { userId, revokedAt: null, ...(keepId ? { id: { not: keepId } } : {}) }, data: { revokedAt: new Date() } });
/** Đăng xuất mọi nơi: vô hiệu cả phiên cũ chưa có bản ghi nhờ mốc thời gian trên User. Làm tròn xuống giây vì iat của token tính theo giây. */
export async function revokeEverywhere(userId: string) {
  const cutoff = new Date(Math.floor(Date.now() / 1000) * 1000);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { tokensValidAfter: cutoff } }),
    prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
export const countLiveSessions = (userId: string) => prisma.userSession.count({ where: { userId, ...live() } });

// ── khoá tạm do đăng nhập sai ──
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;
/** Nguyên tử: tăng bộ đếm; chạm ngưỡng thì khoá LOCK_MINUTES và đặt lại bộ đếm. Trả lockedUntil nếu vừa bị khoá. */
export async function recordFailedLogin(userId: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<{ lockedUntil: Date | null; failedLogins: number }[]>`
    UPDATE "edu"."User" SET
      "failedLogins" = CASE WHEN "failedLogins" + 1 >= ${LOCK_AFTER_FAILURES} THEN 0 ELSE "failedLogins" + 1 END,
      "lockedUntil" = CASE WHEN "failedLogins" + 1 >= ${LOCK_AFTER_FAILURES} THEN NOW() + ${LOCK_MINUTES}::double precision * INTERVAL '1 minute' ELSE "lockedUntil" END
    WHERE "id" = ${userId} RETURNING "lockedUntil", "failedLogins"`;
  const r = rows[0];
  return r && r.failedLogins === 0 ? r.lockedUntil : null;
}
export const recordLoginSuccess = (userId: string) => prisma.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
export const clearLock = (userId: string) => prisma.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
export const writeAudit = (actorEmail: string, action: string, targetId: string) => prisma.activityLog.create({ data: { actorEmail, action, targetType: "User", targetId } });
