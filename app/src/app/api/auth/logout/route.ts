import { NextResponse } from "next/server";
import { observe } from "@/lib/observability/observe";
import { SESSION_COOKIE_NAME } from "@/lib/auth/request-session";

export const POST = observe(async (_request: Request): Promise<Response> => {
  const response = NextResponse.json({ data: { success: true } });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
});
