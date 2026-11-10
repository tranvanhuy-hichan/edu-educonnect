import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/request-session";
import type { SessionUser } from "@/lib/auth/session";

export type Role = "ADMIN" | "PRINCIPAL" | "VICE_PRINCIPAL" | "HOMEROOM_TEACHER" | "SUBJECT_TEACHER" | "LIBRARIAN" | "STUDENT";

/** Người dùng hiện tại. Tương thích SessionUser nên truyền thẳng được vào các service trong src/modules. */
export type Me = SessionUser & { id: string; name: string; mustChangePwd: boolean };

/** Đọc phiên đăng nhập (cookie JWT) + đối chiếu lại DB để tài khoản bị khoá có hiệu lực ngay. */
export const getMe = cache(async (): Promise<Me | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = token ? verifySessionToken(token) : null;
  if (!session) return null;
  const u = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, roles: true, isActive: true, mustChangePwd: true, teacher: { select: { id: true, fullName: true } }, student: { select: { id: true, fullName: true } } },
  });
  if (!u || !u.isActive) return null;
  return {
    id: session.userId,
    userId: session.userId,
    email: u.email,
    name: u.teacher?.fullName ?? u.student?.fullName ?? u.email,
    roles: u.roles,
    teacherId: u.teacher?.id ?? null,
    studentId: u.student?.id ?? null,
    mustChangePwd: u.mustChangePwd,
  };
});

const hasAny = (me: Me, roles: Role[]) => !roles.length || me.roles.some((r) => roles.includes(r));

/** Dùng trong page: chuyển hướng nếu chưa đăng nhập / không đủ quyền (có 1 trong các vai trò được liệt kê). */
export async function requireRole(...roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!hasAny(me, roles)) redirect("/");
  return me;
}

/** Dùng trong server action: ném lỗi nếu sai quyền. Kiểm tra ở cả trang lẫn thao tác, không chỉ ẩn menu. */
export async function assertRole(...roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!me || !hasAny(me, roles)) throw new Error("Không có quyền");
  return me;
}

export const ADMIN_ROLES: Role[] = ["ADMIN"];
/** Quản lý vận hành toàn trường (tương đương STAFF/giáo vụ của ZenClass). */
export const MANAGER_ROLES: Role[] = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"];
export const TEACHING_ROLES: Role[] = ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"];
export const LIBRARY_ROLES: Role[] = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "LIBRARIAN"];
