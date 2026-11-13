"use server";
import { runSharedCommand } from "@/lib/shared-command";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { db } from "@/lib/db";

export const assignUnionLeader = wrap(async (fd) => {
  const me = await assertRole("ADMIN");
  const accountId = str(fd, "accountId");
  const title = str(fd, "position") || null;
  if (!accountId || (title && (title.length < 2 || title.length > 60))) throw new Error("Chọn nhân sự và chức danh hợp lệ");
  // Recheck target and actor inside the database command; revocation never locks the shared identity.
  await runSharedCommand(() => db.$queryRaw`SELECT 1 FROM edu.assign_union_leader('edu', ${me.id}, ${accountId}, ${title})`);
  revalidatePath("/tai-khoan/nhan-su");
  revalidatePath("/tai-khoan");
  return title ? "Đã bổ nhiệm BCH trên tài khoản hiện có" : "Đã thu hồi quyền BCH, giữ quyền EduConnect";
});

/** Separate BCH identity: never attach it to a student or create a teacher implicitly. */
export const createStandaloneUnionAccount = wrap(async (fd) => {
  const me = await assertRole("ADMIN");
  const { z } = await import("zod");
  const { default: bcrypt } = await import("bcryptjs");
  const { genPassword } = await import("@/lib/password");
  const data = z.object({ fullName: z.string().trim().min(2).max(100), username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/), position: z.string().trim().min(2).max(60) }).parse({ fullName: str(fd,"fullName"), username: str(fd,"username"), position: str(fd,"position") });
  if (await db.doanUser.findUnique({ where: { username: data.username } })) throw new Error("Tên đăng nhập đã tồn tại");
  const password = genPassword();
  await db.$transaction(async (tx) => {
    const u = await tx.doanUser.create({ data: { ...data, passwordHash: await bcrypt.hash(password,10), role: "ADMIN", superAdmin: false, mustChangePassword: true } });
    await tx.activityLog.create({ data: { actorEmail: me.email, action: "union_account.create_standalone", targetType: "SharedAccount", targetId: u.id } });
  });
  revalidatePath("/tai-khoan/nhan-su");
  return { ok: "Đã tạo tài khoản BCH riêng. Mật khẩu chỉ hiển thị lần này và được tải về.", data: { credentials: JSON.stringify([{ fullName: data.fullName, username: data.username, password }]) } };
});
export const manageStandaloneUnionAccount = wrap(async (fd) => {
  const me = await assertRole("ADMIN");
  const id = str(fd,"accountId"), command = str(fd,"command");
  const { genPassword } = await import("@/lib/password");
  const { default: bcrypt } = await import("bcryptjs");
  let password: string | null = null;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM public."User" WHERE id=${id} FOR UPDATE`;
    const u = await tx.doanUser.findUnique({ where: { id }, include: { eduUser: true } });
    if (!u || u.role !== "ADMIN" || u.superAdmin || u.eduUser) throw new Error("Chỉ quản lý tài khoản BCH riêng tại đây");
    if (command === "lock" || command === "unlock") await tx.doanUser.update({ where: { id }, data: { status: command === "lock" ? "LOCKED" : "ACTIVE" } });
    else if (command === "reset") {
      password = genPassword();
      await tx.doanUser.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password,10), mustChangePassword: true } });
      await tx.doanPasskey.deleteMany({ where: { userId: id } });
    } else if (command === "save") {
      const position = str(fd,"position"); if (position.length < 2 || position.length > 60) throw new Error("Chức danh dài 2–60 ký tự");
      await tx.doanUser.update({ where: { id }, data: { position } });
    } else throw new Error("Thao tác không hợp lệ");
    await tx.activityLog.create({ data: { actorEmail: me.email, action: `union_account.${command}`, targetType: "SharedAccount", targetId: id } });
  });
  revalidatePath("/tai-khoan/nhan-su");
  return password ? `Mật khẩu BCH mới: ${password} (không thay đổi tài khoản học sinh)` : "Đã cập nhật tài khoản BCH riêng";
});
