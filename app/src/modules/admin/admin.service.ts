import bcrypt from "bcryptjs";
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

  if (input.roles.includes("STUDENT") !== target.roles.includes("STUDENT")) {
    throw new ConflictError("Vai trò học sinh gắn với hồ sơ học sinh, không đổi ở đây");
  }
  if (hasTeacherRole(input.roles) && !target.teacher) {
    throw new ConflictError("Chưa có hồ sơ giáo viên — hãy tạo ở mục Giáo viên trước khi gán vai trò này");
  }
  if (target.roles.includes("ADMIN") && !input.roles.includes("ADMIN")) {
    if (target.id === user.userId) throw new ConflictError("Không thể tự bỏ quyền quản trị của chính mình");
    if ((await adminRepository.countActiveAdminsExcept(id)) === 0) {
      throw new ConflictError("Hệ thống phải còn ít nhất một quản trị viên");
    }
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
