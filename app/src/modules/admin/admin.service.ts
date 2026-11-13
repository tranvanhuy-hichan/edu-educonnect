import bcrypt from "bcryptjs";
import type { Prisma, Role } from "@prisma/client";
import { isSystemAdmin, type SessionUser } from "@/lib/auth/session";
import { genPassword } from "@/lib/password";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import * as adminRepository from "@/modules/admin/admin.repository";
import type {
  CreateUserInput,
  UpdateUserRolesInput,
} from "@/modules/admin/admin.schema";

const TEACHER_ROLES = ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"] as const;
const hasTeacherRole = (roles: readonly string[]) => roles.some((r) => (TEACHER_ROLES as readonly string[]).includes(r));

function assertSystemAdmin(user: SessionUser) {
  if (!isSystemAdmin(user)) {
    throw new ForbiddenError("Chỉ Quản trị hệ thống (role ADMIN) được thực hiện thao tác này");
  }
}

export function listUsers(
  user: SessionUser,
  options: { skip: number; take: number; q?: string },
) {
  assertSystemAdmin(user);
  return adminRepository.listUsers(options);
}

export async function findUserById(user: SessionUser, id: string) {
  assertSystemAdmin(user);
  const found = await adminRepository.findUserById(id);
  if (!found) {
    throw new ConflictError("Tài khoản không tồn tại");
  }
  return found;
}

/**
 * Tạo tài khoản mới (luôn bắt đổi mật khẩu ở lần đăng nhập đầu).
 * Tài khoản học sinh tạo ở mục Học sinh (cần hồ sơ học sinh); vai trò giáo viên cần họ tên để tạo hồ sơ giáo viên.
 */
export async function createUser(user: SessionUser, input: CreateUserInput) {
  assertSystemAdmin(user);

  const email = input.email.trim().toLowerCase();
  if (input.roles.includes("STUDENT")) {
    throw new ConflictError("Tài khoản học sinh được tạo ở mục Học sinh (cần hồ sơ học sinh)");
  }
  const teacherName = hasTeacherRole(input.roles) ? input.fullName?.trim() : undefined;
  if (hasTeacherRole(input.roles) && !teacherName) {
    throw new ConflictError("Nhập họ tên để tạo hồ sơ giáo viên cho vai trò giáo viên");
  }

  const existing = await adminRepository.findUserByEmail(email);
  if (existing) {
    throw new ConflictError("Email này đã có tài khoản trong hệ thống");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const created = await adminRepository.createUser({ ...input, email }, passwordHash, teacherName);
  await adminRepository.createActivityLog(user.email, "create_user", "User", created.id);
  return created;
}

export async function updateUserRoles(
  user: SessionUser,
  id: string,
  input: UpdateUserRolesInput,
) {
  assertSystemAdmin(user);

  const target = await adminRepository.findUserById(id);
  if (!target) throw new ConflictError("Tài khoản không tồn tại");
  if (target.roles.includes("ADMIN")) throw new ForbiddenError("Không được sửa quyền tài khoản quản trị hệ thống");

  if (input.roles.includes("STUDENT") !== target.roles.includes("STUDENT")) {
    throw new ConflictError("Vai trò học sinh gắn với hồ sơ học sinh, không đổi ở đây");
  }
  if (hasTeacherRole(input.roles) && !target.teacher) {
    throw new ConflictError("Chưa có hồ sơ giáo viên — hãy tạo ở mục Giáo viên trước khi gán vai trò này");
  }

  const updated = await adminRepository.updateUserRoles(id, input.roles);
  await adminRepository.createActivityLog(user.email, "update_user_roles", "User", id);
  return updated;
}

export async function setUserActive(user: SessionUser, id: string, isActive: boolean) {
  assertSystemAdmin(user);
  if (!isActive && id === user.userId) {
    throw new ConflictError("Không thể khoá chính mình");
  }
  const updated = await adminRepository.setUserActive(id, isActive);
  await adminRepository.createActivityLog(
    user.email,
    isActive ? "activate_user" : "deactivate_user",
    "User",
    id,
  );
  return updated;
}

/** Đặt lại mật khẩu: không truyền mật khẩu thì sinh ngẫu nhiên. Người dùng bị bắt đổi ở lần đăng nhập kế tiếp. */
export async function resetPassword(user: SessionUser, id: string, newPassword?: string) {
  assertSystemAdmin(user);
  const password = newPassword ?? genPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await adminRepository.updateUserPassword(id, passwordHash);
  await adminRepository.createActivityLog(user.email, "reset_password", "User", id);
  return { id: updated.id, email: updated.email, password };
}

export function listActivityLog(user: SessionUser) {
  assertSystemAdmin(user);
  return adminRepository.listActivityLog();
}

export function listRecentActivitySummaries(user: SessionUser) {
  assertSystemAdmin(user);
  return adminRepository.recentActivitySummaries(6);
}

export const BULK_RESET_MAX_TARGETS = 3000;
export const BULK_RESET_BATCH = 40;
export type BulkResetFilter = { roles: Role[]; classIds: string[]; allClasses: boolean };
export type BulkResetRow = { fullName: string; username: string; className: string; roles: string; password: string };

/**
 * Tìm các tài khoản sẽ được cấp lại mật khẩu. Luôn bỏ qua tài khoản đang khoá và chính người thực hiện
 * (nếu không quản trị sẽ tự bị đăng xuất giữa chừng). Học sinh lọc theo lớp của năm học hiện hành.
 */
export async function findBulkResetTargets(user: SessionUser, filter: BulkResetFilter) {
  assertSystemAdmin(user);
  const staffRoles = filter.roles.filter((r) => r !== "STUDENT");
  const or: Prisma.UserWhereInput[] = [];
  if (staffRoles.length) or.push({ roles: { hasSome: staffRoles } });
  if (filter.roles.includes("STUDENT")) {
    const year = await adminRepository.currentAcademicYear();
    if (!year) throw new ConflictError("Chưa có năm học hiện hành nên không xác định được lớp của học sinh");
    if (!filter.allClasses && !filter.classIds.length) throw new ConflictError("Chọn ít nhất một lớp hoặc chọn tất cả lớp");
    or.push({ student: { enrollments: { some: { academicYearId: year.id, ...(filter.allClasses ? {} : { schoolClassId: { in: filter.classIds } }) } } } });
  }
  if (!or.length) throw new ConflictError("Chọn ít nhất một nhóm tài khoản");
  const rows = await adminRepository.bulkResetTargets({ isActive: true, id: { not: user.userId }, OR: or }, BULK_RESET_MAX_TARGETS + 1);
  if (rows.length > BULK_RESET_MAX_TARGETS) throw new ConflictError(`Quá ${BULK_RESET_MAX_TARGETS} tài khoản trong một lần. Hãy chia nhỏ theo lớp hoặc vai trò.`);
  const students = rows.filter((r) => r.roles.includes("STUDENT")).length;
  return { ids: rows.map((r) => r.id), total: rows.length, students, staff: rows.length - students };
}

/** Cấp lại mật khẩu cho một lô (tối đa BULK_RESET_BATCH). Mỗi người một mật khẩu ngẫu nhiên riêng, bị buộc đổi khi đăng nhập, phiên cũ mất hiệu lực. */
export async function bulkResetPasswords(user: SessionUser, ids: string[]): Promise<BulkResetRow[]> {
  assertSystemAdmin(user);
  const unique = [...new Set(ids)].filter((id) => id !== user.userId);
  if (!unique.length) return [];
  if (unique.length > BULK_RESET_BATCH) throw new ConflictError(`Mỗi lượt tối đa ${BULK_RESET_BATCH} tài khoản`);
  const year = await adminRepository.currentAcademicYear();
  const found = (await adminRepository.usersForReset(unique, year?.id ?? null)).filter((u) => u.isActive);
  const prepared = [];
  for (const u of found) {
    const password = genPassword();
    prepared.push({ u, password, passwordHash: await bcrypt.hash(password, 10) });
  }
  await adminRepository.applyBulkPasswordReset(prepared.map((p) => ({ id: p.u.id, passwordHash: p.passwordHash })), user.email);
  return prepared.map(({ u, password }) => ({
    fullName: u.teacher?.fullName ?? u.student?.fullName ?? u.email,
    username: u.student?.code ?? u.teacher?.code ?? u.email,
    className: u.student?.enrollments[0]?.schoolClass.className ?? "",
    roles: u.roles.join(", "),
    password,
  }));
}
