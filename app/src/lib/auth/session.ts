import type { Role } from "@prisma/client";

export type SessionUser = {
  userId: string;
  email: string;
  roles: Role[];
  teacherId: string | null;
  studentId: string | null;
};

export function hasRole(user: SessionUser, role: Role): boolean {
  return user.roles.includes(role);
}

/** Quyền quản lý nghiệp vụ toàn trường: Hiệu trưởng, Hiệu phó và Quản trị hệ thống (ADMIN là tập con rộng hơn). */
export function isAdmin(user: SessionUser): boolean {
  return hasRole(user, "ADMIN") || hasRole(user, "PRINCIPAL") || hasRole(user, "VICE_PRINCIPAL");
}

/** Thủ thư quản lý thư viện độc lập với học vụ; Hiệu trưởng/Hiệu phó vẫn có toàn quyền. */
export function canManageLibrary(user: SessionUser): boolean {
  return isAdmin(user) || hasRole(user, "LIBRARIAN");
}

/**
 * Quản trị hệ thống (tài khoản, cấu hình, log) — TÁCH BIỆT HOÀN TOÀN khỏi isAdmin()
 * (Hiệu trưởng/Hiệu phó, quản lý nghiệp vụ dạy-học). Chỉ role ADMIN mới true.
 */
export function isSystemAdmin(user: SessionUser): boolean {
  return hasRole(user, "ADMIN");
}
