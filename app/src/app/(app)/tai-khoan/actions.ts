"use server";
import { revalidatePath } from "next/cache";
import { assertRole, ADMIN_ROLES, type Role } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { parseAccountNames } from "@/server/accounts";
import { randomUUID } from "crypto";
import { genPassword } from "@/lib/password";
import * as adminService from "@/modules/admin/admin.service";
import { z } from "zod";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/observability/report-error";
import { ConflictError, ForbiddenError } from "@/shared/errors";

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

// ── Cấp lại mật khẩu hàng loạt: xem trước (chọn ai) rồi chạy theo từng lô nhỏ để không quá thời gian của máy chủ ──
const ROLES = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN", "STUDENT"] as const;
const previewInput = z.object({ roles: z.array(z.enum(ROLES)).min(1).max(7), classIds: z.array(z.string().max(100)).max(300), allClasses: z.boolean() });
const idsInput = z.array(z.string().max(100)).min(1).max(adminService.BULK_RESET_BATCH);
type Failure = { ok: false; error: string };
const fail = (error: unknown): Failure => {
  if (error instanceof ConflictError || error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: "Dữ liệu không hợp lệ" };
  if (error instanceof Error && /quyền|đổi mật khẩu/i.test(error.message)) return { ok: false, error: error.message };
  void reportError(error, { source: "action", route: "/tai-khoan (bulk reset)" });
  return { ok: false, error: "Lỗi hệ thống, vui lòng thử lại" };
};

export async function previewBulkReset(input: unknown): Promise<{ ok: true; ids: string[]; total: number; students: number; staff: number } | Failure> {
  try {
    const me = await assertRole(...ADMIN_ROLES);
    const filter = previewInput.parse(input);
    return { ok: true, ...(await adminService.findBulkResetTargets(me, filter)) };
  } catch (error) { return fail(error); }
}

export async function runBulkReset(ids: unknown): Promise<{ ok: true; rows: adminService.BulkResetRow[] } | Failure> {
  try {
    const me = await assertRole(...ADMIN_ROLES);
    const rl = await rateLimit("bulk-reset", me.id, LIMITS.bulkReset);
    if (!rl.ok) return { ok: false, error: "Thao tác quá nhanh, thử lại sau ít phút" };
    const rows = await adminService.bulkResetPasswords(me, idsInput.parse(ids));
    revalidatePath("/tai-khoan");
    return { ok: true, rows };
  } catch (error) { return fail(error); }
}
