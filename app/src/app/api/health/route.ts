import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness: tiến trình còn sống. Không đụng DB nên dùng cho UptimeRobot/Better Stack/healthcheck của container. */
export function GET() {
  return NextResponse.json({ status: "ok", release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.APP_RELEASE ?? "dev", time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
