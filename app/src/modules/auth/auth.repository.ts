import { prisma } from "@/lib/prisma";

/** Đăng nhập bằng email, hoặc bằng mã học sinh / mã giáo viên (không chứa "@"). */
export function findUserByEmail(login: string) {
  const include = { teacher: true, student: true };
  if (login.includes("@")) return prisma.user.findUnique({ where: { email: login.toLowerCase() }, include });
  return prisma.user.findFirst({
    where: { OR: [{ student: { code: login.toUpperCase() } }, { teacher: { code: login.toUpperCase() } }] },
    include,
  });
}
