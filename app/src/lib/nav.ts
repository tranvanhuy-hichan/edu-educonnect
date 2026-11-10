import { Home, School, GraduationCap, CalendarDays, Repeat, PenLine, Users, Layers, Building2, BookOpen, Library, Trophy, NotebookPen, ClipboardList, ScrollText, ArrowUpCircle, UserCog, Settings, FileClock, Presentation, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/guard";

export type NavItem = { href: string; label: string; icon: LucideIcon; children?: NavItem[] };
export type NavGroup = { title?: string; items: NavItem[] };

const home: NavItem = { href: "/", label: "Trang chủ", icon: Home };
const schedule: NavItem = { href: "/lich-hoc", label: "Thời khóa biểu", icon: CalendarDays };
const exams: NavItem = { href: "/lich-thi", label: "Lịch thi", icon: ClipboardList };
const scores: NavItem = { href: "/nhap-diem", label: "Nhập điểm", icon: PenLine };
const diary: NavItem = { href: "/so-dau-bai", label: "Sổ đầu bài", icon: ScrollText };
const library: NavItem = { href: "/thu-vien", label: "Thư viện", icon: Library };
const lessons: NavItem = { href: "/bai-hoc", label: "Bài học", icon: BookOpen };
const plans: NavItem = { href: "/giao-an", label: "Giáo án", icon: NotebookPen };

export const libraryManageItems: NavItem[] = [
  { href: "/thu-vien?tab=titles", label: "Đầu sách", icon: BookOpen },
  { href: "/thu-vien?tab=copies", label: "Bản sao sách", icon: Layers },
  { href: "/thu-vien?tab=loans", label: "Phiếu mượn", icon: ClipboardList },
  { href: "/thu-vien?tab=overdue", label: "Sách quá hạn", icon: FileClock },
  { href: "/thu-vien?tab=stats", label: "Thống kê", icon: Trophy },
];

/** Vận hành toàn trường — dùng chung cho Quản trị, Hiệu trưởng, Hiệu phó. */
const MANAGE: NavGroup[] = [
  { items: [home] },
  {
    title: "Đào tạo",
    items: [
      { href: "/lop-hoc", label: "Lớp học", icon: School },
      { href: "/hoc-sinh", label: "Học sinh", icon: GraduationCap },
      { href: "/phan-cong", label: "Phân công giảng dạy", icon: Repeat },
      schedule,
      diary,
    ],
  },
  {
    title: "Kiểm tra & đánh giá",
    items: [
      exams,
      scores,
      { href: "/thi-dua", label: "Thi đua", icon: Trophy },
      { href: "/len-lop", label: "Xét lên lớp", icon: ArrowUpCircle },
    ],
  },
  {
    title: "Nhân sự",
    items: [{ href: "/giao-vien", label: "Giáo viên", icon: Users }],
  },
  {
    title: "Danh mục",
    items: [
      { href: "/mon-hoc", label: "Môn học", icon: ClipboardList },
      { href: "/phong-hoc", label: "Phòng học", icon: Building2 },
    ],
  },
  {
    title: "Thư viện",
    items: [{ href: "#thu-vien", label: "Quản lý thư viện", icon: Library, children: libraryManageItems }],
  },
];

/** Chỉ ADMIN: quản trị tài khoản, cấu hình, nhật ký (Hiệu trưởng/Hiệu phó không có). */
const SYSTEM: NavGroup[] = [
  {
    title: "Hệ thống",
    items: [
      { href: "/tai-khoan", label: "Tài khoản", icon: UserCog },
      { href: "/cau-hinh", label: "Cấu hình", icon: Settings },
      { href: "/nhat-ky", label: "Nhật ký hoạt động", icon: FileClock },
    ],
  },
];

/** Giáo viên xem (chỉ đọc) thông tin đào tạo chung của trường. */
const TRAINING_VIEW: NavGroup = {
  title: "Đào tạo",
  items: [
    { href: "/lop-hoc", label: "Danh sách lớp", icon: School },
    { href: "/phong-hoc", label: "Phòng học", icon: Building2 },
    { href: "/giao-vien", label: "Giáo viên", icon: Users },
    { href: "/phan-cong", label: "Phân công giảng dạy", icon: Repeat },
    { href: "/thi-dua", label: "Thi đua", icon: Trophy },
  ],
};

const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  ADMIN: [...MANAGE, ...SYSTEM],
  PRINCIPAL: MANAGE,
  VICE_PRINCIPAL: MANAGE,
  HOMEROOM_TEACHER: [{
    title: "Chủ nhiệm",
    items: [
      schedule, exams,
      { href: "/lop-chu-nhiem", label: "Lớp chủ nhiệm", icon: Presentation },
      { href: "/lop-chu-nhiem?tab=scores", label: "Bảng điểm lớp", icon: ClipboardList },
      { href: "/lop-chu-nhiem?tab=timetable", label: "Thời khóa biểu lớp", icon: CalendarDays },
      { href: "/lop-chu-nhiem?tab=diary", label: "Sổ đầu bài lớp", icon: ScrollText },
      { href: "/lop-chu-nhiem?tab=emulation", label: "Thi đua lớp", icon: Trophy },
      { href: "/lop-chu-nhiem?tab=year", label: "Xét lên lớp", icon: ArrowUpCircle },
    ],
  }],
  SUBJECT_TEACHER: [{ title: "Giảng dạy", items: [{ href: "/lop-cua-toi", label: "Lớp của tôi", icon: School }, schedule, exams, lessons, plans, scores, diary] }],
  LIBRARIAN: [
    { items: [home] },
    {
      title: "Thư viện",
      items: libraryManageItems,
    },
  ],
  STUDENT: [{ items: [{ ...home, label: "Tổng quan" }, schedule, exams, lessons, plans, { href: "/diem-cua-toi", label: "Bảng điểm", icon: ClipboardList }, library] }],
};

/** Thứ tự ưu tiên hiển thị khi một người giữ nhiều vai trò. */
const ORDER: Role[] = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN", "STUDENT"];

/**
 * Gộp menu của TẤT CẢ vai trò người dùng đang giữ (vd GVCN kiêm GVBM thấy cả "Chủ nhiệm" lẫn "Giảng dạy").
 * Khử trùng theo href; nhóm cùng tiêu đề được gộp lại thành một.
 */
export function buildNav(roles: Role[]): NavGroup[] {
  const seen = new Set<string>();
  const groups: NavGroup[] = [];
  const dedupe = (items: NavItem[]): NavItem[] =>
    items.flatMap((it) => {
      if (seen.has(it.href)) return [];
      seen.add(it.href);
      if (!it.children) return [it];
      const children = dedupe(it.children);
      return children.length ? [{ ...it, children }] : [];
    });
  for (const role of ORDER.filter((r) => roles.includes(r))) {
    for (const g of NAV_BY_ROLE[role]) {
      const items = dedupe(g.items);
      if (!items.length) continue;
      const same = g.title ? groups.find((x) => x.title === g.title) : undefined;
      if (same) same.items.push(...items);
      else groups.push({ ...g, items });
    }
  }
  // Nhóm "Đào tạo" (chỉ xem) của giáo viên luôn nằm cuối vì ít dùng; quản lý đã có nhóm đầy đủ.
  if (roles.some((r) => r === "HOMEROOM_TEACHER" || r === "SUBJECT_TEACHER")) {
    const items = dedupe(TRAINING_VIEW.items);
    if (items.length) {
      const same = groups.find((x) => x.title === TRAINING_VIEW.title);
      if (same) same.items.push(...items);
      else groups.push({ ...TRAINING_VIEW, items });
    }
  }
  return groups;
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị hệ thống", PRINCIPAL: "Hiệu trưởng", VICE_PRINCIPAL: "Hiệu phó",
  HOMEROOM_TEACHER: "Giáo viên chủ nhiệm", SUBJECT_TEACHER: "Giáo viên bộ môn", LIBRARIAN: "Thủ thư", STUDENT: "Học sinh",
};

const TITLES: Record<string, string> = {
  "lich-hoc": "Thời khóa biểu", "lich-thi": "Lịch thi", "lop-hoc": "Lớp học", "hoc-sinh": "Học sinh", "giao-vien": "Giáo viên", "phan-cong": "Phân công giảng dạy",
  "nhap-diem": "Nhập điểm", "so-dau-bai": "Sổ đầu bài", "thi-dua": "Thi đua", "len-lop": "Xét lên lớp", "mon-hoc": "Môn học",
  "phong-hoc": "Phòng học", "thu-vien": "Thư viện", "bai-hoc": "Bài học", "giao-an": "Giáo án", "lop-cua-toi": "Lớp của tôi",
  "lop-chu-nhiem": "Lớp chủ nhiệm", "diem-cua-toi": "Bảng điểm", "tai-khoan": "Tài khoản", "cau-hinh": "Cấu hình", "nhat-ky": "Nhật ký hoạt động",
  "doi-mat-khau": "Đổi mật khẩu", ghi: "Ghi sổ đầu bài", them: "Thêm mới",
};
/** Tên thống nhất cho mọi vai trò. */
export const scheduleLabel = (_roles: Role[]) => "Thời khóa biểu";
export const titleOf = (seg: string, roles: Role[] = []) => (seg === "lich-hoc" ? scheduleLabel(roles) : TITLES[seg]);

/** Trang chủ mặc định theo vai trò (dùng sau đăng nhập). */
export function homeForRoles(_roles: Role[]): string {
  return "/";
}
