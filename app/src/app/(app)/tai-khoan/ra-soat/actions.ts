"use server";
import { revalidatePath } from "next/cache";
import { assertRole, ADMIN_ROLES } from "@/lib/guard";
import { wrap } from "@/lib/action";
import { lockAccounts } from "@/modules/admin/account-review.service";

export const lockReviewedAccounts = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) throw new Error("Hãy chọn ít nhất một tài khoản");
  const n = await lockAccounts(me, ids);
  revalidatePath("/tai-khoan/ra-soat"); revalidatePath("/tai-khoan");
  return `Đã khoá ${n} tài khoản và đăng xuất họ khỏi mọi thiết bị. Mở khoá lại được ở trang chi tiết tài khoản.`;
});
