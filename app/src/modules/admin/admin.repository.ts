import { ForbiddenError } from "@/shared/errors";
import { createSharedAccount, setSharedPassword } from "@/modules/account/account.repository";
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
  const code = teacherName ? await freeTeacherCode() : null;
  const teacher = teacherName ? { create: { fullName: teacherName, code } } : undefined;
  return prisma.$transaction(async (tx) => {
    // Tên đăng nhập dùng chung: mã giáo viên nếu có, ngược lại chính email.
    const account = await createSharedAccount(tx, { username: code ?? input.email, passwordHash, fullName: teacherName ?? input.email });
    return tx.user.create({
      data: { accountId: account.id, email: input.email, roles: input.roles, teacher },
      select: { id: true, email: true, roles: true, isActive: true, createdAt: true },
    });
  });
}

export function countActiveAdminsExcept(id: string) {
  return prisma.user.count({ where: { id: { not: id }, isActive: true, roles: { has: "ADMIN" } } });
}

export async function updateUserRoles(id: string, roles: CreateUserInput["roles"]) {
  // Keep the condition in the write itself so concurrent changes cannot edit an ADMIN.
  const changed = await prisma.user.updateMany({ where: { id, NOT: { roles: { has: "ADMIN" } } }, data: { roles } });
  if (!changed.count) throw new ForbiddenError("Không được sửa quyền tài khoản quản trị hệ thống");
  return prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, roles: true, isActive: true } });
}

export function setUserActive(id: string, isActive: boolean) {
  return prisma.user.update({
    where: { id },
    data: { isActive },
    select: { id: true, email: true, roles: true, isActive: true },
  });
}

export async function updateUserPassword(id: string, passwordHash: string) {
  const { accountId } = await prisma.user.findUniqueOrThrow({ where: { id }, select: { accountId: true } });
  await setSharedPassword(prisma, accountId, passwordHash, true);
  return prisma.user.findUniqueOrThrow({ where: { id } });
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
export async function applyBulkPasswordReset(updates: { id: string; passwordHash: string }[], actorEmail: string) {
  const accounts = await prisma.user.findMany({ where: { id: { in: updates.map((u) => u.id) } }, select: { id: true, accountId: true } });
  const accountOf = new Map(accounts.map((a) => [a.id, a.accountId]));
  return prisma.$transaction([
    ...updates.map((u) => prisma.doanUser.update({ where: { id: accountOf.get(u.id)! }, data: { passwordHash: u.passwordHash, mustChangePassword: true }, select: { id: true } })),
    prisma.activityLog.createMany({ data: updates.map((u) => ({ actorEmail, action: "reset_password", targetType: "User", targetId: u.id })) }),
  ]);
}
