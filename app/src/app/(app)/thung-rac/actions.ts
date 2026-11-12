"use server";
import { revalidatePath } from "next/cache";
import { assertRole, ADMIN_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import * as trash from "@/modules/trash/trash.service";

export const restoreTrashItem = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const r = await trash.restoreItem(me, str(fd, "id"));
  await audit(me.email, "restore_trash", r.kind, str(fd, "id"));
  revalidatePath("/thung-rac"); revalidatePath("/hoc-sinh"); revalidatePath("/lop-hoc"); revalidatePath("/ngan-hang-cau-hoi"); revalidatePath("/ngan-hang-bai-hoc");
  return `Đã khôi phục “${r.label}”.${r.notes.length ? ` Lưu ý: ${r.notes.join("; ")}` : ""}`;
});

export const purgeTrashItem = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  await trash.purgeItem(me, str(fd, "id"));
  await audit(me.email, "purge_trash", "TrashItem", str(fd, "id"));
  revalidatePath("/thung-rac");
  return "Đã xoá vĩnh viễn";
});
