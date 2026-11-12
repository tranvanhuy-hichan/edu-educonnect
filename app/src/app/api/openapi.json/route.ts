import { NextResponse } from "next/server";
import { getMe } from "@/lib/guard";
import { isSystemAdmin } from "@/lib/auth/session";
import { buildOpenApi } from "@/lib/openapi/spec";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getMe();
  if (!me || !isSystemAdmin(me)) return NextResponse.json({ error: "Chỉ quản trị hệ thống" }, { status: 403 });
  return NextResponse.json(buildOpenApi());
}
