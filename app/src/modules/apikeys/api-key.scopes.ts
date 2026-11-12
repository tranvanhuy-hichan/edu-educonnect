/**
 * Các quyền (scope) của khoá API. Nguyên tắc: ít dữ liệu nhất có thể. Quyền "đọc" chỉ trả thông tin cơ bản;
 * thông tin liên hệ và định danh cá nhân là các quyền riêng, quản trị phải chủ động bật cho từng khoá.
 */
export const SCOPES = {
  "catalog:read": { label: "Danh mục: môn học, phòng học", hint: "Danh sách môn học và phòng học (cần để tạo lớp hoặc gán môn cho giáo viên).", sensitive: false, write: false },
  "years:read": { label: "Năm học", hint: "Danh sách năm học và năm học hiện hành.", sensitive: false, write: false },
  "grades:read": { label: "Khối", hint: "Danh sách khối, số lớp và số học sinh mỗi khối.", sensitive: false, write: false },
  "classes:read": { label: "Lớp học", hint: "Danh sách lớp, khối, giáo viên chủ nhiệm, sĩ số.", sensitive: false, write: false },
  "students:read": { label: "Học sinh (cơ bản)", hint: "Mã, họ tên, giới tính, ngày sinh, lớp, khối, trạng thái.", sensitive: false, write: false },
  "students:contact": { label: "Học sinh: liên hệ và phụ huynh", hint: "Thêm số điện thoại, email, địa chỉ và thông tin người giám hộ.", sensitive: true, write: false },
  "students:identity": { label: "Học sinh: định danh cá nhân", hint: "Thêm số CCCD/CMND, nơi sinh, dân tộc.", sensitive: true, write: false },
  "teachers:read": { label: "Giáo viên (cơ bản)", hint: "Mã, họ tên, giới tính, môn phụ trách, lớp chủ nhiệm.", sensitive: false, write: false },
  "teachers:contact": { label: "Giáo viên: liên hệ", hint: "Thêm số điện thoại và email liên hệ.", sensitive: true, write: false },
  "youth:read": { label: "Thông tin Đoàn (đọc)", hint: "Trạng thái đoàn viên, ngày kết nạp, chi đoàn, chức vụ của học sinh.", sensitive: false, write: false },
  "youth:write": { label: "GHI thông tin Đoàn", hint: "Cập nhật trạng thái đoàn viên, ngày kết nạp, chi đoàn, chức vụ của học sinh. Không đụng hồ sơ học tập.", sensitive: true, write: true },
  "students:write": { label: "GHI học sinh", hint: "Tạo học sinh (kèm tài khoản), sửa họ tên, ngày sinh, giới tính, chuyển/xếp lớp. Sửa liên hệ cần thêm students:contact, định danh cần thêm students:identity.", sensitive: true, write: true },
  "teachers:write": { label: "GHI giáo viên", hint: "Tạo giáo viên (kèm tài khoản), sửa hồ sơ và môn phụ trách. Sửa liên hệ cần thêm teachers:contact.", sensitive: true, write: true },
  "classes:write": { label: "GHI lớp học", hint: "Tạo lớp, đổi tên, đổi phòng, đổi giáo viên chủ nhiệm.", sensitive: true, write: true },
} as const;
export type Scope = keyof typeof SCOPES;
export const SCOPE_LIST = Object.keys(SCOPES) as Scope[];

/** Quyền mở rộng kéo theo quyền cơ bản tương ứng (không thể xem liên hệ mà không xem được học sinh). */
const REQUIRES: Partial<Record<Scope, Scope[]>> = {
  "students:contact": ["students:read"], "students:identity": ["students:read"], "teachers:contact": ["teachers:read"],
  "youth:write": ["youth:read"], "students:write": ["students:read"], "teachers:write": ["teachers:read", "catalog:read"], "classes:write": ["classes:read", "catalog:read", "teachers:read"],
};

export function normalizeScopes(input: readonly string[]): Scope[] {
  const set = new Set<Scope>();
  for (const s of input) {
    if (!(s in SCOPES)) throw new Error(`Quyền không hợp lệ: ${s}`);
    set.add(s as Scope);
    for (const base of REQUIRES[s as Scope] ?? []) set.add(base);
  }
  if (!set.size) throw new Error("Chọn ít nhất một quyền cho khoá API");
  return SCOPE_LIST.filter((s) => set.has(s));
}
