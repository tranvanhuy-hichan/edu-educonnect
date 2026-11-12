import { DOAN_ONLY_ROLES } from "@/modules/account/account.repository";
import { consumeLoginAttempt } from "./login-throttle.repository";
import { credentialTag, matchesCredential } from "@/lib/auth/credential-tag";
import bcrypt from "bcryptjs";
import * as authRepository from "@/modules/auth/auth.repository";
import * as sessions from "@/modules/auth/session.repository";
import { describeDevice, maskIp } from "@/lib/auth/device";
import type { LoginInput } from "@/modules/auth/auth.schema";
import type { SessionUser } from "@/lib/auth/session";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email hoặc mật khẩu không đúng");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountLockedError extends Error {
  constructor(minutes: number) {
    super(`Tài khoản tạm khoá do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau ${minutes} phút hoặc liên hệ quản trị viên.`);
    this.name = "AccountLockedError";
  }
}

export class AccountDisabledError extends Error {
  constructor() {
    super("Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên");
    this.name = "AccountDisabledError";
  }
}

export async function login(input: LoginInput): Promise<SessionUser> {
  if (!await consumeLoginAttempt("user", input.email)) throw new InvalidCredentialsError();
  const user = await authRepository.findUserByEmail(input.email);
  if (!user) {
    throw new InvalidCredentialsError();
  }

  if (!await consumeLoginAttempt("user-account", user.id)) throw new InvalidCredentialsError();
  // Đang bị khoá tạm: không so mật khẩu để kẻ đoán mật khẩu không có thêm lượt nào.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw new AccountLockedError(Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)));
  const passwordMatches = await bcrypt.compare(
    input.password,
    user.passwordHash,
  );
  if (!passwordMatches) {
    const lockedUntil = await sessions.recordFailedLogin(user.id);
    if (lockedUntil) {
      await sessions.writeAudit("hệ thống", "login_locked", user.id).catch(() => undefined);
      throw new AccountLockedError(sessions.LOCK_MINUTES);
    }
    throw new InvalidCredentialsError();
  }

  // Khoá ở tài khoản dùng chung (do Cổng Đoàn khoá) hoặc khoá riêng của EduConnect; tài khoản chỉ thuộc Cổng Đoàn (Admin) không vào được.
  if (!user.isActive || user.accountStatus !== "ACTIVE" || DOAN_ONLY_ROLES.includes(user.accountRole as never)) {
    throw new AccountDisabledError();
  }
  await sessions.recordLoginSuccess(user.id);

  return {
    credentialTag: credentialTag(user.passwordHash),
    userId: user.id,
    email: user.email,
    roles: user.roles,
    teacherId: user.teacher?.id ?? null,
    studentId: user.student?.id ?? null,
  };
}

/** Ghi nhận một phiên đăng nhập (thiết bị) và trả mã phiên để gắn vào token. */
export async function startSession(userId: string, userAgent: string | null, ip: string | null) {
  return (await sessions.createSession(userId, describeDevice(userAgent), maskIp(ip))).id;
}

const TOUCH_EVERY_MS = 5 * 60_000;

/**
 * Resolve the current database identity so disabled accounts take effect immediately.
 * meta (từ token): kiểm tra thêm "đăng xuất mọi nơi" (iat) và phiên đã bị thu hồi (sid).
 */
export async function resolveSessionIdentity(userId: string, tag?: string, meta?: { sid?: string; iat?: number }) {
  const user = await authRepository.findSessionIdentity(userId);
  if (!user?.isActive || user.accountStatus !== "ACTIVE" || DOAN_ONLY_ROLES.includes(user.accountRole as never) || !matchesCredential(tag, user.passwordHash)) return null;
  if (meta) {
    if (user.tokensValidAfter && (meta.iat ?? 0) * 1000 < user.tokensValidAfter.getTime()) return null;
    if (meta.sid) {
      const session = await sessions.findSession(meta.sid);
      if (!session || session.userId !== userId || session.revokedAt) return null;
      if (Date.now() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) await sessions.touchSession(session.id).catch(() => undefined);
    }
  }
  return {
    id: userId, userId, email: user.email,
    name: user.teacher?.fullName ?? user.student?.fullName ?? user.email,
    roles: user.roles, teacherId: user.teacher?.id ?? null,
    studentId: user.student?.id ?? null, mustChangePwd: user.mustChangePwd, onboarded: !!user.onboardedAt,
  };
}

/** Danh tính cho worker nền (không có cookie/credential tag): chỉ cần tài khoản còn hoạt động. */
export async function resolveWorkerIdentity(userId: string) {
  const user = await authRepository.findSessionIdentity(userId);
  if (!user?.isActive || user.accountStatus !== "ACTIVE" || DOAN_ONLY_ROLES.includes(user.accountRole as never)) return null;
  return { userId, email: user.email, roles: user.roles, teacherId: user.teacher?.id ?? null, studentId: user.student?.id ?? null };
}
