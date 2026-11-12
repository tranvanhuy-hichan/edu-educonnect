import { NextResponse, type NextRequest } from "next/server";
import { observe } from "@/lib/observability/observe";
import { mapErrorToResponse } from "@/lib/api/handler";
import { signSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/request-session";
import { loginSchema } from "@/modules/auth/auth.schema";
import * as authService from "@/modules/auth/auth.service";

export const POST = observe(async (request: NextRequest): Promise<Response> => {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);
    const sessionUser = await authService.login(input);
    // Mỗi lần đăng nhập là một phiên có tên thiết bị: người dùng xem và thu hồi được ở /phien-dang-nhap.
    const sid = await authService.startSession(sessionUser.userId, request.headers.get("user-agent"), request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null);
    const token = signSessionToken({ ...sessionUser, sid });

    const response = NextResponse.json({ data: sessionUser });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    return mapErrorToResponse(error);
  }
});
