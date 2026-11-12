import { NextResponse } from "next/server";
import { observe } from "@/lib/observability/observe";
import { SESSION_COOKIE_NAME } from "@/lib/auth/request-session";
import { verifySessionToken } from "@/lib/auth/jwt";
import { revokeSession } from "@/modules/auth/session.repository";

export const POST = observe(async (request: Request): Promise<Response> => {
  // Đăng xuất = thu hồi phiên này để danh sách thiết bị luôn đúng (cookie bị xoá cũng không dùng lại được).
  const token = request.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  const payload = token ? verifySessionToken(decodeURIComponent(token)) : null;
  if (payload?.sid) await revokeSession(payload.sid, payload.userId).catch(() => undefined);
  const response = NextResponse.json({ data: { success: true } });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
});
