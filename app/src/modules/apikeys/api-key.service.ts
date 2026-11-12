import { createHash, randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";
import { LIMITS, rateLimit, rateLimitPeek, type RateLimitResult } from "@/lib/rate-limit";
import { isSystemAdmin, type SessionUser } from "@/lib/auth/session";
import { maskIp } from "@/lib/auth/device";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import { normalizeScopes, type Scope } from "./api-key.scopes";
import { ipAllowed, isValidAllowEntry } from "./ip";
import * as repo from "./api-key.repository";

const KEY_FORMAT = /^ek_[A-Za-z0-9_-]{32}$/;
export const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");
/** 32 ký tự ngẫu nhiên (192 bit): không thể đoán bằng cách thử, nên chỉ cần băm SHA-256 để lưu. */
export const generateKey = () => `ek_${randomBytes(24).toString("base64url")}`;

export type CreateKeyInput = { name: string; scopes: string[]; ipAllowlist?: string[]; rateLimitPerMin?: number; expiresInDays?: number | null; note?: string };

function assertAdmin(user: SessionUser) {
  if (!isSystemAdmin(user)) throw new ForbiddenError("Chỉ Quản trị hệ thống được quản lý khoá API");
}

export function validateCreate(input: CreateKeyInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new ConflictError("Tên khoá từ 2 đến 80 ký tự");
  const scopes = normalizeScopes(input.scopes);
  const ips = (input.ipAllowlist ?? []).map((s) => s.trim()).filter(Boolean);
  for (const ip of ips) if (!isValidAllowEntry(ip)) throw new ConflictError(`Địa chỉ IP không hợp lệ: ${ip}`);
  const rate = input.rateLimitPerMin ?? 120;
  if (!Number.isInteger(rate) || rate < 10 || rate > 1000) throw new ConflictError("Giới hạn tốc độ từ 10 đến 1000 yêu cầu/phút");
  const days = input.expiresInDays ?? null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 1095)) throw new ConflictError("Thời hạn từ 1 đến 1095 ngày");
  return { name, scopes, ips, rate, expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null, note: input.note?.trim().slice(0, 300) || null };
}

/** Tạo khoá mới. Trả khoá gốc đúng một lần: sau đó không thể xem lại, chỉ có thể thu hồi và cấp khoá khác. */
export async function createApiKey(user: SessionUser, input: CreateKeyInput) {
  assertAdmin(user);
  const v = validateCreate(input);
  const secret = generateKey();
  const row = await repo.createKey({ name: v.name, keyPrefix: secret.slice(0, 8), keyHash: hashKey(secret), scopes: v.scopes, ipAllowlist: v.ips, rateLimitPerMin: v.rate, expiresAt: v.expiresAt, note: v.note, createdBy: user.email });
  await repo.writeAudit(user.email, "create_api_key", row.id);
  return { row, secret };
}

export async function revokeApiKey(user: SessionUser, id: string) {
  assertAdmin(user);
  const r = await repo.revokeKey(id);
  if (!r.count) throw new ConflictError("Khoá không tồn tại hoặc đã bị thu hồi");
  await repo.writeAudit(user.email, "revoke_api_key", id);
}

/** Xoay khoá: tạo khoá mới cùng cấu hình rồi thu hồi khoá cũ. Hệ thống bên ngoài phải đổi sang khoá mới ngay. */
export async function rotateApiKey(user: SessionUser, id: string) {
  assertAdmin(user);
  const old = await repo.findById(id);
  if (!old || old.revokedAt) throw new ConflictError("Khoá không tồn tại hoặc đã bị thu hồi");
  const days = old.expiresAt ? Math.max(1, Math.ceil((old.expiresAt.getTime() - Date.now()) / 86_400_000)) : null;
  const made = await createApiKey(user, { name: old.name, scopes: old.scopes, ipAllowlist: old.ipAllowlist, rateLimitPerMin: old.rateLimitPerMin, expiresInDays: days, note: old.note ?? undefined });
  await repo.revokeKey(id);
  await repo.writeAudit(user.email, "rotate_api_key", id);
  return made;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export type AuthFailure = { ok: false; status: 401 | 403 | 429; code: string; message: string; retryAfterSec?: number; /** Có khi đã nhận ra khoá (bị từ chối vì IP hoặc giới hạn tốc độ) để ghi nhật ký theo khoá. */ keyId?: string; ip?: string };
export type AuthSuccess = { ok: true; key: NonNullable<Awaited<ReturnType<typeof repo.findByHash>>>; scopes: Set<Scope>; ip: string; limit: RateLimitResult };

/** Đọc khoá từ header Authorization: Bearer … hoặc X-API-Key. Không nhận khoá qua URL (sẽ lọt vào log và lịch sử trình duyệt). */
export function extractKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  const bearer = auth && /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  return (bearer || request.headers.get("x-api-key") || "").trim() || null;
}

const fail = (status: AuthFailure["status"], code: string, message: string, retryAfterSec?: number, keyId?: string, ip?: string): AuthFailure => ({ ok: false, status, code, message, retryAfterSec, keyId, ip });

/** Xác thực một yêu cầu: khoá hợp lệ, chưa thu hồi/hết hạn, đúng IP, trong giới hạn tốc độ. */
export async function authenticate(request: Request): Promise<AuthSuccess | AuthFailure> {
  const ip = clientIp(request);
  // Chặn sớm các IP thử khoá sai liên tục (giảm nhiễu log và thăm dò)
  if (await rateLimitPeek("api-auth-fail", ip, LIMITS.apiAuthFail)) return fail(429, "too_many_failures", "Quá nhiều khoá không hợp lệ từ địa chỉ này. Vui lòng thử lại sau.", 600);
  const raw = extractKey(request);
  const reject = async (code: string, message: string) => {
    await rateLimit("api-auth-fail", ip, LIMITS.apiAuthFail);
    logger.warn({ code, ip: maskIp(ip) }, "api_auth_rejected");
    return fail(401, code, message);
  };
  if (!raw) return reject("missing_api_key", "Thiếu khoá API. Gửi header Authorization: Bearer <khoá>.");
  if (!KEY_FORMAT.test(raw)) return reject("invalid_api_key", "Khoá API không hợp lệ.");
  const key = await repo.findByHash(hashKey(raw));
  if (!key) return reject("invalid_api_key", "Khoá API không hợp lệ.");
  if (key.revokedAt) return reject("key_revoked", "Khoá API đã bị thu hồi.");
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return reject("key_expired", "Khoá API đã hết hạn.");
  if (!ipAllowed(ip, key.ipAllowlist)) {
    logger.warn({ keyId: key.id, ip: maskIp(ip) }, "api_ip_not_allowed");
    return fail(403, "ip_not_allowed", "Địa chỉ IP của bạn không nằm trong danh sách được phép của khoá này.", undefined, key.id, ip);
  }
  const limit = await rateLimit("api-key", key.id, { limit: key.rateLimitPerMin, windowSec: 60 });
  if (!limit.ok) return fail(429, "rate_limited", `Vượt giới hạn ${key.rateLimitPerMin} yêu cầu/phút. Vui lòng thử lại sau.`, limit.retryAfterSec, key.id, ip);
  return { ok: true, key, scopes: new Set(key.scopes as Scope[]), ip, limit };
}

export const recordCall = async (keyId: string, ip: string, row: { method: string; path: string; status: number; ms: number }) => {
  try { await repo.insertLog({ keyId, ...row, ipMasked: maskIp(ip) }); await repo.touchUsed(keyId, maskIp(ip)); }
  catch (error) { logger.warn({ err: error }, "api_log_failed"); }
};
