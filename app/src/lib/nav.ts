import { FileQuestion, FolderOpen, Home, School, GraduationCap, CalendarDays, Repeat, PenLine, Users, Layers, Building2, BookOpen, Library, Trophy, ClipboardList, ScrollText, FileClock, Activity, ArrowUpCircle, UserCog, Settings, Presentation, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/guard";

export type NavItem = { href: string; label: string; icon: LucideIcon; children?: NavItem[]; /** Các đường dẫn khác cũng được tính là đang ở mục này (trang con dạng tab). */ also?: string[] };
/** Các trang nằm trong mục "Vận hành hệ thống". */
export const SYSTEM_TAB_PATHS = ["/nhat-ky", "/thung-rac", "/ket-noi-api"];
export type NavGroup = { title?: string; items: NavItem[] };

const home: NavItem = { href: "/", label: "Trang chủ", icon: Home };
const schedule: NavItem = { href: "/lich-hoc", label: "Thời khóa biểu", icon: CalendarDays };
const exams: NavItem = { href: "/lich-thi", label: "Lịch thi", icon: ClipboardList };
const scores: NavItem = { href: "/nhap-diem", label: "Nhập điểm", icon: PenLine };
const diary: NavItem = { href: "/so-dau-bai", label: "Sổ đầu bài", icon: ScrollText };
const library: NavItem = { href: "/thu-vien", label: "Thư viện", icon: Library };
const lessons: NavItem = { href: "/bai-hoc", label: "Bài học", icon: BookOpen };
/** Quản lý nội dung bài học (kho riêng của giáo viên), không gắn với lớp. */
const lessonBank: NavItem = { href: "/ngan-hang-bai-hoc", label: "Bài học", icon: FolderOpen };
/** Dành cho quản lý: Giảng dạy theo môn → khối → lớp → bài học của lớp. Giáo viên dùng "Lớp của tôi". */
const teaching: NavItem = { href: "/giang-day", label: "Giảng dạy", icon: GraduationCap };
const questionBank: NavItem = { href: "/ngan-hang-cau-hoi", label: "Ngân hàng câu hỏi", icon: FileQuestion };

export const libraryManageItems: NavItem[] = [
  { href: "/thu-vien?tab=titles", label: "Đầu sách", icon: BookOpen },
  { href: "/thu-vien?tab=copies", label: "Bản sao sách", icon: Layers },
  { href: "/thu-vien?tab=loans", label: "Phiếu mượn", icon: ClipboardList },
  { href: "/thu-vien?tab=overdue", label: "Sách quá hạn", icon: FileClock },
  { href: "/thu-vien?tab=stats", label: "Thống kê", icon: Trophy },
];

/** Vận hành toàn trường — dùng chung cho Quản trị, Hiệu trưởng, Hiệu phó. Gom theo công việc, mỗi nhóm 3-5 mục. */
const MANAGE: NavGroup[] = [
  { items: [home] },
  {
    title: "Đào tạo",
    items: [
      { href: "/lop-hoc", label: "Lớp học", icon: School },
      { href: "/hoc-sinh", label: "Học sinh", icon: GraduationCap },
      { href: "/giao-vien", label: "Giáo viên", icon: Users },
      { href: "/phan-cong", label: "Phân công giảng dạy", icon: Repeat },
      schedule,
    ],
  },
  {
    title: "Giảng dạy & học liệu",
    items: [teaching, lessonBank, questionBank, diary],
  },
  {
    title: "Đánh giá",
    items: [
      exams,
      scores,
      { href: "/thi-dua", label: "Thi đua", icon: Trophy },
      { href: "/len-lop", label: "Xét lên lớp", icon: ArrowUpCircle },
    ],
  },
  {
    title: "Danh mục",
    items: [
      { href: "/mon-hoc", label: "Môn học", icon: ClipboardList },
      { href: "/phong-hoc", label: "Phòng học", icon: Building2 },
      { href: "#thu-vien", label: "Thư viện", icon: Library, children: libraryManageItems },
    ],
  },
];

/** Chỉ ADMIN: quản trị tài khoản, cấu hình, nhật ký (Hiệu trưởng/Hiệu phó không có). */
const SYSTEM: NavGroup[] = [
  {
    title: "Hệ thống",
    items: [
      { href: "/tai-khoan", label: "Tài khoản", icon: UserCog },
      { href: "/cau-hinh", label: "Cấu hình", icon: Settings },
      // Một mục duy nhất; các trang con là tab (components/system-tabs.tsx): vận hành, nhật ký, thùng rác, kết nối API.
      { href: "/van-hanh", label: "Vận hành hệ thống", icon: Activity, also: SYSTEM_TAB_PATHS },
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
  SUBJECT_TEACHER: [{ title: "Giảng dạy", items: [{ href: "/lop-cua-toi", label: "Lớp của tôi", icon: School }, schedule, exams, lessonBank, questionBank, scores, diary] }],
  LIBRARIAN: [
    { items: [home] },
    {
      title: "Thư viện",
      items: libraryManageItems,
    },
  ],
  STUDENT: [{ items: [{ ...home, label: "Tổng quan" }, schedule, exams, lessons, { href: "/diem-cua-toi", label: "Bảng điểm", icon: ClipboardList }, library] }],
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

/** Five everyday destinations, restricted to the navigation available to the user. */
export function buildMobileNav(roles: Role[]): NavItem[] {
  const allowed = buildNav(roles).flatMap((group) => group.items.flatMap((item) => item.children ?? [item]));
  const preferred = ["/lop-hoc", "/lich-hoc", "/so-dau-bai", "/lop-chu-nhiem?tab=diary", "/nhap-diem", "/lop-chu-nhiem?tab=scores", "/giang-day", "/bai-hoc", "/lich-thi", "/diem-cua-toi", "/thu-vien?tab=titles", "/thu-vien?tab=copies", "/thu-vien?tab=loans", "/thu-vien?tab=overdue", "/thu-vien"];
  const items: NavItem[] = [home];
  for (const href of preferred) {
    const item = allowed.find((entry) => entry.href === href);
    if (!item) continue;
    if (href.includes("tab=diary") && items.some((entry) => entry.href === diary.href)) continue;
    if (href.includes("tab=scores") && items.some((entry) => entry.href === scores.href)) continue;
    const label = href === "/lich-hoc" ? "TKB" : href === "/lop-hoc" ? "Lớp học" : href.includes("tab=diary") ? "Sổ đầu bài" : href.includes("tab=scores") ? "Bảng điểm" : item.label;
    items.push({ ...item, label });
    if (items.length === 5) break;
  }
  return items;
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị hệ thống", PRINCIPAL: "Hiệu trưởng", VICE_PRINCIPAL: "Hiệu phó",
  HOMEROOM_TEACHER: "Giáo viên chủ nhiệm", SUBJECT_TEACHER: "Giáo viên bộ môn", LIBRARIAN: "Thủ thư", STUDENT: "Học sinh",
};

const TITLES: Record<string, string> = {
  "lich-hoc": "Thời khóa biểu", "lich-thi": "Lịch thi", "lop-hoc": "Lớp học", "hoc-sinh": "Học sinh", "giao-vien": "Giáo viên", "phan-cong": "Phân công giảng dạy",
  "nhap-diem": "Nhập điểm", "so-dau-bai": "Sổ đầu bài", "thi-dua": "Thi đua", "len-lop": "Xét lên lớp", "mon-hoc": "Môn học",
  "phong-hoc": "Phòng học", "thu-vien": "Thư viện", "bai-hoc": "Bài học", "giang-day": "Giảng dạy", "ngan-hang-bai-hoc": "Bài học", "ngan-hang-cau-hoi": "Ngân hàng câu hỏi", "lop-cua-toi": "Lớp của tôi",
  "lop-chu-nhiem": "Lớp chủ nhiệm", "diem-cua-toi": "Bảng điểm", "tai-khoan": "Tài khoản", "cau-hinh": "Cấu hình", "nhat-ky": "Nhật ký hoạt động", "van-hanh": "Vận hành hệ thống", "thung-rac": "Thùng rác", "ket-noi-api": "Kết nối ngoài (API)", "phien-dang-nhap": "Phiên đăng nhập",
  "doi-mat-khau": "Đổi mật khẩu", ghi: "Ghi sổ đầu bài", them: "Thêm mới",
};
/** Tên thống nhất cho mọi vai trò. */
export const scheduleLabel = (_roles: Role[]) => "Thời khóa biểu";
export const titleOf = (seg: string, roles: Role[] = []) => (seg === "lich-hoc" ? scheduleLabel(roles) : TITLES[seg]);

/** Trang chủ mặc định theo vai trò (dùng sau đăng nhập). */
export function homeForRoles(_roles: Role[]): string {
  return "/";
}
