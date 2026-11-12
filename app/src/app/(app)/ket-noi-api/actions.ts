"use server";
import { revalidatePath } from "next/cache";
import { assertRole, ADMIN_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import * as keys from "@/modules/apikeys/api-key.service";
import { revertApiChange } from "@/modules/public-api/write/revert";

const lines = (v: string) => v.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

/** Tạo khoá API. Khoá gốc trả về trong data.secret và chỉ hiện đúng một lần. */
export const createKeyAction = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const days = str(fd, "expiresInDays");
  const { row, secret } = await keys.createApiKey(me, {
    name: str(fd, "name"), scopes: fd.getAll("scopes").map(String), ipAllowlist: lines(str(fd, "ipAllowlist")),
    rateLimitPerMin: Number(str(fd, "rateLimitPerMin") || 120), expiresInDays: days ? Number(days) : null, note: str(fd, "note"),
  });
  // KHÔNG revalidate ở đây: vẽ lại trang có thể làm biến mất hộp đang hiện khoá gốc (chỉ hiện một lần). Danh sách tự làm mới khi người dùng đóng hộp.
  return { ok: `Đã tạo khoá “${row.name}”.`, data: { secret } };
});

export const rotateKeyAction = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const { row, secret } = await keys.rotateApiKey(me, str(fd, "id"));
  // Không revalidate: nút Xoay khoá nằm trong dòng của khoá CŨ, vẽ lại trang sẽ xoá dòng đó cùng hộp hiện khoá mới. Danh sách làm mới khi đóng hộp.
  return { ok: `Đã xoay khoá “${row.name}”. Khoá cũ đã bị thu hồi.`, data: { secret } };
});

export const revokeKeyAction = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  await keys.revokeApiKey(me, str(fd, "id"));
  revalidatePath("/ket-noi-api");
  return "Đã thu hồi khoá. Hệ thống đang dùng khoá này sẽ bị từ chối ngay.";
});

/** Hoàn tác một thay đổi do hệ thống ngoài thực hiện (chỉ khi dữ liệu chưa bị sửa tiếp). */
export const revertChangeAction = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  await revertApiChange(me, str(fd, "id"));
  revalidatePath("/ket-noi-api"); revalidatePath("/hoc-sinh"); revalidatePath("/giao-vien"); revalidatePath("/lop-hoc"); revalidatePath("/thung-rac");
  return "Đã hoàn tác thay đổi.";
});
