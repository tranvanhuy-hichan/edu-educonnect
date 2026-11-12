"use server";
import { assertRole } from "@/lib/guard";
import { db } from "@/lib/db";

/** Đánh dấu đã xem hướng dẫn lần đầu (một lần cho mỗi tài khoản, mọi thiết bị). */
export async function finishOnboarding() {
  const me = await assertRole();
  await db.user.update({ where: { id: me.id }, data: { onboardedAt: new Date() } });
}
