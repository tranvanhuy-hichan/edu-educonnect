"use server";
import { revalidatePath } from "next/cache";
import { assertRole, ADMIN_ROLES, type Role } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { parseAccountNames } from "@/server/accounts";
import { randomUUID } from "crypto";
import { genPassword } from "@/lib/password";
import * as adminService from "@/modules/admin/admin.service";

const ROLE_VALUES: Role[] = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN", "STUDENT"];
const rolesOf = (fd: FormData) => fd.getAll("roles").map(String).filter((r): r is Role => (ROLE_VALUES as string[]).includes(r));

export const createAccount = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const email = str(fd, "email");
  const roles = rolesOf(fd);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Nhập email hợp lệ");
  if (!roles.length) throw new Error("Chọn ít nhất một vai trò");
  const password = genPassword();
  await adminService.createUser(me, { email, password, roles, fullName: str(fd, "fullName") });
  revalidatePath("/tai-khoan");
  return { ok: "Đã tạo tài khoản. File mật khẩu ban đầu đang tự tải về.", data: { credentials: JSON.stringify([{ fullName: str(fd, "fullName"), username: email.toLowerCase(), password }]) } };
});

export const updateAccountRoles = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "userId");
  const roles = rolesOf(fd);
  if (!roles.length) throw new Error("Chọn ít nhất một vai trò");
  await adminService.updateUserRoles(me, id, { roles });
  revalidatePath("/tai-khoan");
  revalidatePath(`/tai-khoan/${id}`);
  return "Đã cập nhật vai trò";
});

export const toggleAccount = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "userId");
  const lock = str(fd, "lock") === "1";
  await adminService.setUserActive(me, id, !lock);
  revalidatePath("/tai-khoan");
  revalidatePath(`/tai-khoan/${id}`);
});

export const resetAccountPassword = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "userId");
  const { email, password } = await adminService.resetPassword(me, id);
  revalidatePath(`/tai-khoan/${id}`);
  return `Mật khẩu mới của ${email}: ${password} (chỉ hiện một lần, người dùng phải đổi khi đăng nhập)`;
});

export const importAccounts = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const names = parseAccountNames(str(fd, "list"));
  const roles = rolesOf(fd);
  if (!roles.length || roles.includes("STUDENT")) throw new Error("Chọn vai trò hợp lệ. Học sinh được nhập tại lớp học.");
  const rows = [];
  for (const fullName of names) {
    const email = `tk${randomUUID().replaceAll("-", "")}@sonha.edu.vn`;
    const password = genPassword();
    try {
      await adminService.createUser(me, { email, password, roles, fullName });
      rows.push({ fullName, username: email, password, status: "Đã tạo" });
    } catch (error) {
      rows.push({ fullName, username: "", password: "", status: error instanceof Error ? error.message : "Không tạo được tài khoản" });
    }
  }
  revalidatePath("/tai-khoan"); revalidatePath("/giao-vien");
  return { ok: `Đã tạo ${rows.filter((r) => r.username).length}/${names.length} tài khoản. File mật khẩu và kết quả từng dòng đang tự tải về.`, data: { credentials: JSON.stringify(rows) } };
});
