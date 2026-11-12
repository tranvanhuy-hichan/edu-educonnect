import { NextResponse } from "next/server";
import { getParentSession } from "@/lib/auth/parent-session";
import { parentGate } from "@/modules/parent/parent-auth.service";
import { observe } from "@/lib/observability/observe";
import { countParentUnread, listParentNotifications, markAllParentRead, markParentRead } from "@/modules/notification/parent-notification.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thông báo của phụ huynh đang đăng nhập (cùng dạng với /api/notifications để dùng chung chuông thông báo). */
export const GET = observe(async (_request: Request) => {
  const parent = await getParentSession();
  if (!parent) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  if (parentGate(parent)) return NextResponse.json({ error: "Cần xác minh số điện thoại và đổi mật khẩu trước khi xem" }, { status: 403 });
  const [notifications, unreadCount] = await Promise.all([listParentNotifications(parent.phone), countParentUnread(parent.phone)]);
  return NextResponse.json({ notifications, unreadCount }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = observe(async (request: Request) => {
  const parent = await getParentSession();
  if (!parent) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  if (parentGate(parent)) return NextResponse.json({ error: "Cần xác minh số điện thoại và đổi mật khẩu trước khi xem" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; id?: unknown };
  if (body.action === "read_all") { await markAllParentRead(parent.phone); return NextResponse.json({ ok: true }); }
  if (typeof body.id === "string" && body.id.length <= 100) { await markParentRead(body.id, parent.phone); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
});
