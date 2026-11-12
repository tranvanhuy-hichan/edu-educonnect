import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { databaseFor, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
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

/** Dashboard summaries do not need the full audit payload. */
export function recentActivitySummaries(take: number, context?: DatabaseContext) {
  return databaseFor(context).activityLog.findMany({
    select: { id: true, actorEmail: true, action: true, targetType: true, targetId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Năm học hiện hành: năm học đã bắt đầu gần nhất. */
export function currentAcademicYear() {
  return prisma.academicYear.findFirst({ where: { startDate: { lte: new Date() } }, orderBy: { startDate: "desc" } });
}

export function bulkResetTargets(where: Prisma.UserWhereInput, take: number) {
  return prisma.user.findMany({ where, select: { id: true, roles: true }, take });
}

export function usersForReset(ids: string[], academicYearId: string | null) {
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, email: true, roles: true, isActive: true,
      teacher: { select: { fullName: true, code: true } },
      student: { select: { fullName: true, code: true, enrollments: { where: academicYearId ? { academicYearId } : {}, take: 1, select: { schoolClass: { select: { className: true } } } } } },
    },
  });
}

/** Đổi mật khẩu cả lô trong một transaction (hoặc đổi hết, hoặc không đổi ai) và ghi nhật ký từng tài khoản. */
export function applyBulkPasswordReset(updates: { id: string; passwordHash: string }[], actorEmail: string) {
  return prisma.$transaction([
    ...updates.map((u) => prisma.user.update({ where: { id: u.id }, data: { passwordHash: u.passwordHash, mustChangePwd: true }, select: { id: true } })),
    prisma.activityLog.createMany({ data: updates.map((u) => ({ actorEmail, action: "reset_password", targetType: "User", targetId: u.id })) }),
  ]);
}
