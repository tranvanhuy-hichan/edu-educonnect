"use server";
import { createSharedAccount, setSharedPassword, credentialOfUser } from "@/modules/account/account.repository";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { assertSignedIn } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const changeMyPassword = wrap(async (fd) => {
  const me = await assertSignedIn(); // mọi người dùng đã đăng nhập, kể cả khi đang bị buộc đổi mật khẩu
  const rl = await rateLimit("change-password", me.id, LIMITS.changePassword);
  if (!rl.ok) throw new Error(`Bạn nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(rl.retryAfterSec / 60)} phút.`);
  const u = await credentialOfUser(db, me.id);
  if (!(await bcrypt.compare(str(fd, "old"), u.passwordHash))) throw new Error("Mật khẩu cũ không đúng");
  const nw = str(fd, "new");
  if (nw.length < 6) throw new Error("Mật khẩu mới tối thiểu 6 ký tự");
  if (nw === str(fd, "old")) throw new Error("Mật khẩu mới phải khác mật khẩu hiện tại");
  await setSharedPassword(db, u.accountId, await bcrypt.hash(nw, 10), false); // mật khẩu dùng chung: đổi ở đây cũng có hiệu lực ở Cổng Đoàn
  await audit(me.email, "change_password", "User", me.id);
  redirect("/");
});
