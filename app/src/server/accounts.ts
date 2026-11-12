import { createSharedAccount, setSharedPassword, credentialOfUser } from "@/modules/account/account.repository";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { genPassword } from "@/lib/password";
import type { Role } from "@prisma/client";

export async function resetPassword(userId: string) {
  const password = genPassword();
  const { accountId } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { accountId: true } });
  await setSharedPassword(db, accountId, await bcrypt.hash(password, 10), true);
  return password;
}

/** Người này đã giữ vai trò `role` chưa? Chưa thì thêm (vd. được giao chủ nhiệm lớp thì có thêm vai trò GVCN, tài khoản không đổi). */
export async function ensureTeacherRole(teacherId: string, role: Extract<Role, "HOMEROOM_TEACHER" | "SUBJECT_TEACHER">) {
  const t = await db.teacher.findUnique({ where: { id: teacherId }, select: { user: { select: { id: true, roles: true } } } });
  if (t && !t.user.roles.includes(role)) await db.user.update({ where: { id: t.user.id }, data: { roles: [...t.user.roles, role] } });
}

/** Validate the entire name list before creating any account. */
export function parseAccountNames(text: string) {
  const names = text.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (!names.length) throw new Error("Nhập danh sách họ tên");
  if (names.length > 200) throw new Error("Mỗi lần nhập tối đa 200 người");
  names.forEach((name, index) => {
    if (name.length < 2 || name.length > 200) throw new Error(`Dòng ${index + 1}: họ tên phải từ 2 đến 200 ký tự`);
  });
  return names;
}
