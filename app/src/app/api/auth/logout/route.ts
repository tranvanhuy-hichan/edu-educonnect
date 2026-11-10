import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/request-session";

export async function POST(): Promise<Response> {
  const response = NextResponse.json({ data: { success: true } });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
