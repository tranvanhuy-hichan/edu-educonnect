import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Tài khoản đăng nhập DÙNG CHUNG với Cổng thông tin Đoàn: bảng public."User" (do khkt sở hữu).
 * Tên đăng nhập, mật khẩu (bcrypt), trạng thái khoá và cờ "phải đổi mật khẩu" chỉ lưu ở đó.
 * EduConnect không bao giờ tự lưu mật khẩu riêng; mọi thao tác mật khẩu đi qua module này.
 */
type Db = Prisma.TransactionClient | typeof prisma;

/** Vai trò của tài khoản dùng chung chỉ thuộc Cổng Đoàn: không được cấp quyền vào EduConnect (Admin phải tách riêng). */
export const DOAN_ONLY_ROLES = ["ADMIN", "DEPARTMENT_ACCOUNT"] as const;

/** Chọn các cột tài khoản mà EduConnect cần đọc. */
export const accountSelect = { passwordHash: true, mustChangePassword: true, status: true, role: true, username: true } as const;

/**
 * Tạo tài khoản dùng chung cho người CHƯA có tài khoản ở Cổng Đoàn (giáo viên, nhân sự, học sinh tạo từ EduConnect).
 * Vai trò EXTERNAL: mật khẩu đúng cũng không vào được Cổng Đoàn, không nhận thông báo của Đoàn.
 */
export function createSharedAccount(db: Db, d: { username: string; passwordHash: string; fullName: string; mustChange?: boolean }) {
  return db.doanUser.create({
    data: { username: d.username, passwordHash: d.passwordHash, fullName: d.fullName, role: "EXTERNAL", mustChangePassword: d.mustChange ?? true },
    select: { id: true },
  });
}

/** Đặt mật khẩu (đã băm). mustChange=true: buộc đổi ở lần đăng nhập kế (cả hai hệ thống). */
export function setSharedPassword(db: Db, accountId: string, passwordHash: string, mustChange: boolean) {
  return db.doanUser.update({ where: { id: accountId }, data: { passwordHash, mustChangePassword: mustChange }, select: { id: true } });
}

/** Mật khẩu hiện tại (đã băm) của tài khoản gắn với người dùng EduConnect. */
export async function credentialOfUser(db: Db, userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { accountId: true, account: { select: accountSelect } } });
  return { accountId: u.accountId, ...u.account };
}

/** Làm phẳng user + account về dạng cũ (passwordHash, mustChangePwd) để phần còn lại của ứng dụng ít phải đổi. */
export function flattenAccount<T extends { account: { passwordHash: string; mustChangePassword: boolean; status: string; role: string } }>(u: T) {
  const { account, ...rest } = u;
  return { ...rest, passwordHash: account.passwordHash, mustChangePwd: account.mustChangePassword, accountStatus: account.status, accountRole: account.role };
}
