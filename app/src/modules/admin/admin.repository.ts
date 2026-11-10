import { prisma } from "@/lib/prisma";
import { genTeacherCode } from "@/lib/password";
import type { CreateUserInput } from "@/modules/admin/admin.schema";

export async function listUsers(options: { skip: number; take: number; q?: string }) {
  const where = options.q
    ? { email: { contains: options.q, mode: "insensitive" as const } }
    : undefined;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        roles: true,
        isActive: true,
        createdAt: true,
        teacher: { select: { fullName: true } },
        student: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: options.skip,
      take: options.take,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total };
}

export function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      roles: true,
      isActive: true,
      createdAt: true,
      teacher: { select: { id: true, fullName: true, phone: true } },
      student: { select: { id: true, fullName: true } },
    },
  });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

async function freeTeacherCode() {
  for (let i = 0; i < 20; i++) {
    const code = genTeacherCode();
    if (!(await prisma.teacher.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Không tạo được mã giáo viên");
}

/** Tạo tài khoản (bắt đổi mật khẩu lần đầu); nếu kèm họ tên giáo viên thì tạo luôn hồ sơ giáo viên. */
export async function createUser(input: CreateUserInput, passwordHash: string, teacherName?: string) {
  const teacher = teacherName ? { create: { fullName: teacherName, code: await freeTeacherCode() } } : undefined;
  return prisma.user.create({
    data: { email: input.email, passwordHash, roles: input.roles, mustChangePwd: true, teacher },
    select: { id: true, email: true, roles: true, isActive: true, createdAt: true },
  });
}

export function countActiveAdminsExcept(id: string) {
  return prisma.user.count({ where: { id: { not: id }, isActive: true, roles: { has: "ADMIN" } } });
}

export function updateUserRoles(id: string, roles: CreateUserInput["roles"]) {
  return prisma.user.update({
    where: { id },
    data: { roles },
    select: { id: true, email: true, roles: true, isActive: true },
  });
}

export function setUserActive(id: string, isActive: boolean) {
  return prisma.user.update({
    where: { id },
    data: { isActive },
    select: { id: true, email: true, roles: true, isActive: true },
  });
}

export function updateUserPassword(id: string, passwordHash: string) {
  return prisma.user.update({ where: { id }, data: { passwordHash, mustChangePwd: true } });
}

export function createActivityLog(
  actorEmail: string,
  action: string,
  targetType: string,
  targetId?: string,
) {
  return prisma.activityLog.create({
    data: { actorEmail, action, targetType, targetId },
  });
}

export function listActivityLog(take = 100) {
  return prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });
}
