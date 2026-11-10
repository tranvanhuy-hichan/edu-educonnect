import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/jwt";
import type { SessionUser } from "@/lib/auth/session";

export const SESSION_COOKIE_NAME = "educonnect_session";

/** Đọc & xác thực session từ cookie httpOnly của request. Trả null nếu chưa đăng nhập/hết hạn. */
export function getSessionUser(request: NextRequest): SessionUser | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
