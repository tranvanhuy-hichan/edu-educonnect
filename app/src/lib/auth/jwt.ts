import jwt from "jsonwebtoken";
import type { SessionUser } from "@/lib/auth/session";

const JWT_SECRET = process.env.JWT_SECRET;

function getSecret(): string {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET chưa được cấu hình trong biến môi trường");
  }
  return JWT_SECRET;
}

export function signSessionToken(user: SessionUser): string {
  return jwt.sign(user, getSecret(), { expiresIn: "7d" });
}

export function verifySessionToken(token: string): SessionUser | null {
  try {
    return jwt.verify(token, getSecret()) as SessionUser;
  } catch {
    return null;
  }
}
