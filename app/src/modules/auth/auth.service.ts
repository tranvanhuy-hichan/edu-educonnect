import { consumeLoginAttempt } from "./login-throttle.repository";
import { credentialTag, matchesCredential } from "@/lib/auth/credential-tag";
import bcrypt from "bcryptjs";
import * as authRepository from "@/modules/auth/auth.repository";
import type { LoginInput } from "@/modules/auth/auth.schema";
import type { SessionUser } from "@/lib/auth/session";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email hoặc mật khẩu không đúng");
    this.name = "InvalidCredentialsError";
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
  const passwordMatches = await bcrypt.compare(
    input.password,
    user.passwordHash,
  );
  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  if (!user.isActive) {
    throw new AccountDisabledError();
  }

  return {
    credentialTag: credentialTag(user.passwordHash),
    userId: user.id,
    email: user.email,
    roles: user.roles,
    teacherId: user.teacher?.id ?? null,
    studentId: user.student?.id ?? null,
  };
}

/** Resolve the current database identity so disabled accounts take effect immediately. */
export async function resolveSessionIdentity(userId: string, tag?: string) {
  const user = await authRepository.findSessionIdentity(userId);
  if (!user?.isActive || !matchesCredential(tag, user.passwordHash)) return null;
  return {
    id: userId, userId, email: user.email,
    name: user.teacher?.fullName ?? user.student?.fullName ?? user.email,
    roles: user.roles, teacherId: user.teacher?.id ?? null,
    studentId: user.student?.id ?? null, mustChangePwd: user.mustChangePwd,
  };
}

/** Danh tính cho worker nền (không có cookie/credential tag): chỉ cần tài khoản còn hoạt động. */
export async function resolveWorkerIdentity(userId: string) {
  const user = await authRepository.findSessionIdentity(userId);
  if (!user?.isActive) return null;
  return { userId, email: user.email, roles: user.roles, teacherId: user.teacher?.id ?? null, studentId: user.student?.id ?? null };
}
