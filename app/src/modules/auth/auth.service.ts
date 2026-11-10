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
  const user = await authRepository.findUserByEmail(input.email);
  if (!user) {
    throw new InvalidCredentialsError();
  }

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
    userId: user.id,
    email: user.email,
    roles: user.roles,
    teacherId: user.teacher?.id ?? null,
    studentId: user.student?.id ?? null,
  };
}
