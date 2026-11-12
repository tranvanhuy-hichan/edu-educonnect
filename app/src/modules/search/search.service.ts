import * as repo from "./search.repository";
import { hasRole, isAdmin, isSystemAdmin, type SessionUser } from "@/lib/auth/session";

export const SEARCH_LIMIT = 5;
export type SearchItem = { id: string; label: string; sub: string; href: string };
export type SearchGroup = { key: "students" | "teachers" | "accounts" | "classes"; label: string; listHref: string; items: SearchItem[]; more: boolean };

const teaching = (u: SessionUser) => hasRole(u, "HOMEROOM_TEACHER") || hasRole(u, "SUBJECT_TEACHER");

/**
 * Tìm nhanh cho ô tìm kiếm trên thanh trên cùng. PHẠM VI THEO QUYỀN, trùng với quyền xem của chính các trang danh sách:
 * học sinh → Hiệu trưởng/Hiệu phó/Quản trị; giáo viên và lớp → thêm giáo viên; tài khoản → chỉ Quản trị. Học sinh/Thủ thư không có gì.
 * Mỗi nhóm lấy SEARCH_LIMIT + 1 dòng để biết còn kết quả nữa hay không.
 */
export async function searchEverything(user: SessionUser, raw: string): Promise<SearchGroup[]> {
  const q = raw.trim().slice(0, 60);
  if (q.length < 2) return [];
  const take = SEARCH_LIMIT + 1;
  const groups: Promise<SearchGroup | null>[] = [];
  const pack = <T>(key: SearchGroup["key"], label: string, listHref: string, rows: T[], toItem: (r: T) => SearchItem): SearchGroup | null =>
    rows.length ? { key, label, listHref: `${listHref}?q=${encodeURIComponent(q)}`, items: rows.slice(0, SEARCH_LIMIT).map(toItem), more: rows.length > SEARCH_LIMIT } : null;

  if (isAdmin(user)) {
    groups.push(repo.findStudents(q, take).then((rows) => pack("students", "Học sinh", "/hoc-sinh", rows, (s) => ({ id: s.id, label: s.fullName, sub: [s.code, s.enrollments[0] && `lớp ${s.enrollments[0].schoolClass.className}`].filter(Boolean).join(" · "), href: `/hoc-sinh/${s.id}` }))));
  }
  if (isAdmin(user) || teaching(user)) {
    groups.push(repo.findTeachers(q, take).then((rows) => pack("teachers", "Giáo viên", "/giao-vien", rows, (t) => ({ id: t.id, label: t.fullName, sub: t.code ?? "Giáo viên", href: `/giao-vien/${t.id}` }))));
    groups.push(repo.findClasses(q, take).then((rows) => pack("classes", "Lớp học", "/lop-hoc", rows, (c) => ({ id: c.id, label: c.className, sub: c.gradeLevel.gradeName, href: `/lop-hoc/${c.id}` }))));
  }
  if (isSystemAdmin(user)) {
    groups.push(repo.findAccounts(q, take).then((rows) => pack("accounts", "Tài khoản", "/tai-khoan", rows, (u) => ({ id: u.id, label: u.teacher?.fullName ?? u.student?.fullName ?? u.email, sub: u.isActive ? u.email : `${u.email} · đã khoá`, href: `/tai-khoan/${u.id}` }))));
  }
  return (await Promise.all(groups)).filter((g): g is SearchGroup => g !== null);
}
