import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Card } from "@/components/ui";
import { saveDoanPolicy } from "./doan-policy-actions";

const GROUPS = [
  ["years", "Năm học & học kỳ", "Thêm, sửa năm học, lịch năm học (tuần 1, học kỳ)."],
  ["classes", "Lớp (chi đoàn)", "Tạo, đổi tên, xóa lớp. Lớp của Cổng Đoàn chính là chi đoàn."],
  ["placement", "Xếp lớp & chuyển năm học", "Chuyển đoàn viên giữa các chi đoàn, nút Cập nhật năm học, xếp học sinh vào lớp."],
  ["profiles", "Hồ sơ học sinh", "Sửa họ tên, ngày sinh, giới tính; thêm, nhập, xóa học sinh."],
] as const;

type Flags = Record<(typeof GROUPS)[number][0], boolean>;
const PRESET_LIST: readonly (readonly [string, string, string, Flags])[] = [
  ["open", "Mở", "Cổng Đoàn ghi được mọi nhóm (như hiện nay)", { years: true, classes: true, placement: true, profiles: true }],
  ["balanced", "Cân bằng", "Chỉ xem năm học, lớp, xếp lớp; vẫn sửa hồ sơ học sinh", { years: false, classes: false, placement: false, profiles: true }],
  ["edu", "EduConnect toàn quyền", "Cổng Đoàn chỉ xem toàn bộ dữ liệu dùng chung", { years: false, classes: false, placement: false, profiles: false }],
];

/** Tab "Cổng Đoàn": EduConnect có quyền cao hơn với dữ liệu dùng chung, admin đặt Cổng Đoàn được ghi nhóm nào. */
export async function DoanPolicyPanel() {
  // Chưa chạy migration tạo bảng chính sách: báo hướng dẫn thay vì làm sập trang.
  const [ready] = await db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('edu."DoanWritePolicy"') IS NOT NULL AS ready`;
  if (!ready.ready) return <Card className="space-y-2"><h2 className="font-semibold">Chưa cài bảng quyền của Cổng Đoàn</h2><p className="text-sm text-slate-600">Cơ sở dữ liệu chưa có bảng <code>edu.DoanWritePolicy</code>. Chạy migration <code>20261120000000_doan_write_policy</code> rồi tải lại trang. Trong lúc chưa cài, Cổng Đoàn được ghi mọi dữ liệu dùng chung như trước.</p></Card>;
  const [policy, sync] = await Promise.all([db.doanWritePolicy.findUnique({ where: { id: 1 } }), db.syncSetting.findUnique({ where: { id: 1 } })]);
  const p = policy ?? { years: true, classes: true, placement: true, profiles: true, updatedBy: null, updatedAt: null };
  const active = PRESET_LIST.find(([, , , f]) => GROUPS.every(([k]) => f[k] === p[k]));
  return <div className="space-y-4">
    <Card className="space-y-2">
      <h2 className="font-semibold">Quyền của Cổng Đoàn với dữ liệu dùng chung</h2>
      <p className="text-sm text-slate-600">EduConnect có quyền cao hơn. Nhóm nào bị tắt thì Cổng Đoàn chỉ xem được, mọi thao tác ghi bị từ chối kèm thông báo. EduConnect luôn ghi được. Dữ liệu riêng của Đoàn (đoàn viên, điểm, hoạt động, bí thư, cờ đỏ) không bị ảnh hưởng.</p>
      {!sync?.enabled && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Đồng bộ với Cổng Đoàn đang tắt, nên các quyền dưới đây chưa có hiệu lực. Cổng Đoàn chạy riêng được ghi tự do.</p>}
    </Card>
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Đang áp dụng</h3>
        <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-800">{active ? active[1] : "Tùy chỉnh"}</span></div>
      <ul className="grid gap-2 sm:grid-cols-2">{GROUPS.map(([key, name]) => <li key={key} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
        <span>{name}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${p[key] ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>{p[key] ? "Cổng Đoàn được ghi" : "Chỉ EduConnect ghi"}</span>
      </li>)}</ul>
      {p.updatedBy && <p className="text-xs text-slate-500">Cập nhật lần cuối bởi {p.updatedBy}{p.updatedAt ? ` · ${new Date(p.updatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}.</p>}
    </Card>
    <Card className="space-y-3">
      <h3 className="font-medium">Mẫu cài sẵn</h3>
      <div className="grid gap-2 md:grid-cols-3">{PRESET_LIST.map(([key, name, hint]) => {
        const on = active?.[0] === key;
        return <div key={key} className={`space-y-2 rounded-lg border p-3 ${on ? "border-orange-400 bg-orange-50/60 ring-1 ring-orange-300" : ""}`}><div className="flex items-center justify-between gap-2 font-medium">{name}{on && <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[11px] font-medium text-white">Đang áp dụng</span>}</div><p className="text-xs text-slate-500">{hint}</p>
          {!on && <ActionForm action={saveDoanPolicy} submit={`Áp dụng "${name}"`} compact reset={false} confirmText={`Áp dụng mẫu "${name}" cho quyền của Cổng Đoàn?`}><input type="hidden" name="preset" value={key} /></ActionForm>}</div>;
      })}</div>
    </Card>
    <Card className="space-y-3">
      <h3 className="font-medium">Cho phép Cổng Đoàn ghi</h3>
      <ActionForm action={saveDoanPolicy} submit="Lưu quyền" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
        {GROUPS.map(([key, name, hint]) => <label key={key} className="flex items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" name={key} defaultChecked={p[key]} className="mt-1 size-4" />
          <span><span className="block font-medium">{name}</span><span className="block text-sm text-slate-500">{hint}</span></span>
        </label>)}
      </ActionForm>
    </Card>
  </div>;
}
