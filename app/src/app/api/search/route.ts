import { NextResponse } from "next/server";
import { getMe } from "@/lib/guard";
import { observe } from "@/lib/observability/observe";
import { setRequestUser } from "@/lib/observability/request-context";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { searchEverything } from "@/modules/search/search.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tìm kiếm nhanh cho thanh trên cùng: GET /api/search?q=... (≥ 2 ký tự). Kết quả giới hạn theo quyền của người gọi. */
export const GET = observe(async (request: Request) => {
  const user = await getMe();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  if (user.mustChangePwd) return NextResponse.json({ error: "Vui lòng đổi mật khẩu được cấp trước khi tiếp tục" }, { status: 403 });
  setRequestUser(user.userId);
  const rl = await rateLimit("search", user.userId, LIMITS.search);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ groups: await searchEverything(user, q) }, { headers: { "Cache-Control": "private, no-store" } });
});
