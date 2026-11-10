import { NextResponse, type NextRequest } from "next/server";
import { mapErrorToResponse } from "@/lib/api/handler";
import { signSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/request-session";
import { loginSchema } from "@/modules/auth/auth.schema";
import * as authService from "@/modules/auth/auth.service";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);
    const sessionUser = await authService.login(input);
    const token = signSessionToken(sessionUser);

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
}
