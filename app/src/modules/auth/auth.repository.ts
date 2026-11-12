import { prisma } from "@/lib/prisma";
import { accountSelect, flattenAccount } from "@/modules/account/account.repository";

const include = { teacher: true, student: true, account: { select: accountSelect } } as const;

/**
 * Đăng nhập bằng tên đăng nhập DÙNG CHUNG (chính là mã đoàn viên/học sinh/giáo viên ở Cổng Đoàn),
 * hoặc bằng email (tài khoản quản trị/nhân sự cũ). Mật khẩu lấy từ tài khoản dùng chung.
 */
export async function findUserByEmail(login: string) {
  const login0 = login.trim();
  if (login0.includes("@")) {
    const u = await prisma.user.findUnique({ where: { email: login0.toLowerCase() }, include });
    return u && flattenAccount(u);
  }
  const code = login0.toUpperCase();
  const u = await prisma.user.findFirst({
    where: { OR: [{ account: { username: { in: [login0, code] } } }, { student: { code } }, { teacher: { code } }] },
    include,
  });
  return u && flattenAccount(u);
}

export async function findSessionIdentity(id: string) {
  const u = await prisma.user.findUnique({
    where: { id },
    select: { email: true, roles: true, isActive: true, tokensValidAfter: true, onboardedAt: true, teacher: { select: { id: true, fullName: true } }, student: { select: { id: true, fullName: true } }, account: { select: accountSelect } },
  });
  return u && flattenAccount(u);
}
