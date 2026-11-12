"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { assertRole } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { SESSION_COOKIE_NAME } from "@/lib/auth/request-session";
import { verifySessionToken } from "@/lib/auth/jwt";
import * as sessions from "@/modules/auth/session.repository";

/** Mã phiên của thiết bị đang dùng (để không tự đăng xuất nhầm). */
export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return (token ? verifySessionToken(token)?.sid : null) ?? null;
}

export const revokeMySession = wrap(async (fd) => {
  const me = await assertRole();
  const id = str(fd, "id");
  if (id === (await currentSessionId())) throw new Error("Đây là thiết bị bạn đang dùng. Hãy dùng nút Đăng xuất ở góc phải.");
  const r = await sessions.revokeSession(id, me.id);
  if (!r.count) throw new Error("Phiên này không còn hiệu lực");
  revalidatePath("/phien-dang-nhap");
  return "Đã đăng xuất thiết bị đó";
});

export const revokeMyOtherSessions = wrap(async () => {
  const me = await assertRole();
  const r = await sessions.revokeOtherSessions(me.id, await currentSessionId());
  revalidatePath("/phien-dang-nhap");
  return r.count ? `Đã đăng xuất ${r.count} thiết bị khác` : "Không có thiết bị nào khác đang đăng nhập";
});

/** Mất điện thoại / nghi lộ mật khẩu: vô hiệu mọi phiên (kể cả phiên cũ), đăng xuất luôn thiết bị này. */
export const logoutEverywhere = wrap(async () => {
  const me = await assertRole();
  await sessions.revokeEverywhere(me.id);
  (await cookies()).delete(SESSION_COOKIE_NAME);
  redirect("/login");
});
