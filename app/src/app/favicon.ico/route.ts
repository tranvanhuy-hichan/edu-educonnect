import { NextResponse } from "next/server";
import { getSchoolSetting } from "@/lib/school-setting";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const brand = await getSchoolSetting();
    if (brand.logoUrl) {
      return NextResponse.redirect(brand.logoUrl, { status: 307, headers: { "Cache-Control": "no-store" } });
    }
  } catch {}
  const url = new URL("/favicon.svg", req.url);
  return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "no-store" } });
}
