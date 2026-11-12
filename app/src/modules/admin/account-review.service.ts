import { isSystemAdmin, type SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/shared/errors";
import * as repo from "./account-review.repository";
import * as adminRepo from "./admin.repository";
import * as sessions from "@/modules/auth/session.repository";

export const STALE_DAYS = 90;
const NEW_ACCOUNT_DAYS = 30;
const DAY = 86_400_000;

export type ReviewRow = { id: string; name: string; email: string; roles: string[]; lastLoginAt: Date | null; createdAt: Date; lockedUntil: Date | null };
type Raw = Awaited<ReturnType<typeof repo.lockedNow>>[number];
const row = (u: Raw): ReviewRow => ({ id: u.id, name: u.teacher?.fullName ?? u.student?.fullName ?? u.email, email: u.email, roles: u.roles, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, lockedUntil: u.lockedUntil });

export type AccountReview = {
  /** Hệ thống chỉ biết lần đăng nhập từ khi có tính năng này; chưa đủ 30 ngày thì chưa kết luận "chưa từng đăng nhập". */
  trackingReady: boolean; trackingSince: Date | null;
  stale: ReviewRow[]; neverLoggedIn: ReviewRow[]; idleTeachers: ReviewRow[]; leftStudents: ReviewRow[]; locked: ReviewRow[];
  total: number;
};

/** Tài khoản cần rà soát. Không tự khoá ai: chỉ liệt kê để quản trị quyết định. */
export async function accountReview(user: SessionUser, now = new Date()): Promise<AccountReview> {
  if (!isSystemAdmin(user)) throw new ForbiddenError("Chỉ Quản trị hệ thống được rà soát tài khoản");
  return buildReview(user.userId, now);
}

/** Dùng cho tác vụ nền (không có người dùng): tính cùng bộ số liệu. */
export async function buildReview(exceptUserId: string, now = new Date()): Promise<AccountReview> {
  const year = await repo.currentYear(now);
  const trackingSince = await repo.firstTrackedLogin();
  const trackingReady = !!trackingSince && now.getTime() - trackingSince.getTime() >= NEW_ACCOUNT_DAYS * DAY;
  const [stale, never, idle, left, locked] = await Promise.all([
    repo.usersNotSeenSince(new Date(now.getTime() - STALE_DAYS * DAY), exceptUserId),
    trackingReady ? repo.staffNeverLoggedIn(new Date(now.getTime() - NEW_ACCOUNT_DAYS * DAY), exceptUserId) : Promise.resolve([]),
    year ? repo.idleTeachers(year.id, exceptUserId) : Promise.resolve([]),
    year ? repo.studentsWithoutClass(year.id) : Promise.resolve([]),
    repo.lockedNow(now),
  ]);
  const r = { stale: stale.map(row), neverLoggedIn: never.map(row), idleTeachers: idle.map(row), leftStudents: left.map(row), locked: locked.map(row) };
  return { trackingReady, trackingSince, ...r, total: new Set([...r.stale, ...r.neverLoggedIn, ...r.idleTeachers, ...r.leftStudents].map((x) => x.id)).size };
}

/** Khoá hàng loạt các tài khoản đã chọn: tắt đăng nhập, đăng xuất mọi thiết bị, ghi nhật ký. Bỏ qua chính người thực hiện. */
export async function lockAccounts(user: SessionUser, ids: string[]) {
  if (!isSystemAdmin(user)) throw new ForbiddenError("Chỉ Quản trị hệ thống được khoá tài khoản");
  let locked = 0;
  for (const id of [...new Set(ids)].filter((i) => i !== user.userId).slice(0, 200)) {
    await adminRepo.setUserActive(id, false);
    await sessions.revokeEverywhere(id);
    await adminRepo.createActivityLog(user.email, "deactivate_user", "User", id);
    locked++;
  }
  return locked;
}
export const adminUserIds = repo.adminUserIds;
