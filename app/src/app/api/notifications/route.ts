import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/guard";
import {
  countUnreadNotifications,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/modules/notification/notification.service";

export async function GET() {
  const me = await getMe();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [notifications, unreadCount] = await Promise.all([
    listUserNotifications(me.userId, 20),
    countUnreadNotifications(me.userId),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.action === "read_all") {
    await markAllNotificationsRead(me.userId);
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    await markNotificationRead(body.id, me.userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
