import { prisma } from "@/lib/prisma";

export type NewKey = { name: string; keyPrefix: string; keyHash: string; scopes: string[]; ipAllowlist: string[]; rateLimitPerMin: number; expiresAt: Date | null; note: string | null; createdBy: string };

export const createKey = (data: NewKey) => prisma.apiKey.create({ data });
export const findByHash = (keyHash: string) => prisma.apiKey.findUnique({ where: { keyHash } });
export const findById = (id: string) => prisma.apiKey.findUnique({ where: { id } });
export const revokeKey = (id: string) => prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
export const touchUsed = (id: string, ip: string) => prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date(), lastUsedIp: ip } });
export const insertLog = (row: { keyId: string; method: string; path: string; status: number; ms: number; ipMasked: string }) => prisma.apiRequestLog.create({ data: row });

export const listKeys = () => prisma.apiKey.findMany({ orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }] });
/** Số lần gọi và số lỗi trong 24 giờ qua theo từng khoá (cho trang quản trị). */
export async function usageLast24h() {
  const since = new Date(Date.now() - 86_400_000);
  const rows = await prisma.apiRequestLog.groupBy({ by: ["keyId", "status"], where: { createdAt: { gte: since } }, _count: true });
  const out = new Map<string, { total: number; errors: number }>();
  for (const r of rows) {
    const u = out.get(r.keyId) ?? { total: 0, errors: 0 };
    u.total += r._count; if (r.status >= 400) u.errors += r._count;
    out.set(r.keyId, u);
  }
  return out;
}
export const recentLogs = (keyId: string, take = 30) => prisma.apiRequestLog.findMany({ where: { keyId }, orderBy: { createdAt: "desc" }, take });
export const writeAudit = (actorEmail: string, action: string, targetId: string) => prisma.activityLog.create({ data: { actorEmail, action, targetType: "ApiKey", targetId } });
