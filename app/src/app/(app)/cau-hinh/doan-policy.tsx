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

const PRESET_LIST = [
  ["open", "Mở", "Cổng Đoàn ghi được mọi nhóm (như hiện nay)"],
  ["balanced", "Cân bằng", "Chỉ xem năm học, lớp, xếp lớp; vẫn sửa hồ sơ học sinh"],
  ["edu", "EduConnect toàn quyền", "Cổng Đoàn chỉ xem toàn bộ dữ liệu dùng chung"],
] as const;

/** Tab "Cổng Đoàn": EduConnect có quyền cao hơn với dữ liệu dùng chung, admin đặt Cổng Đoàn được ghi nhóm nào. */
export async function DoanPolicyPanel() {
  const [policy, sync] = await Promise.all([db.doanWritePolicy.findUnique({ where: { id: 1 } }), db.syncSetting.findUnique({ where: { id: 1 } })]);
  const p = policy ?? { years: true, classes: true, placement: true, profiles: true, updatedBy: null, updatedAt: null };
  return <div className="space-y-4">
    <Card className="space-y-2">
      <h2 className="font-semibold">Quyền của Cổng Đoàn với dữ liệu dùng chung</h2>
      <p className="text-sm text-slate-600">EduConnect có quyền cao hơn. Nhóm nào bị tắt thì Cổng Đoàn chỉ xem được, mọi thao tác ghi bị từ chối kèm thông báo. EduConnect luôn ghi được. Dữ liệu riêng của Đoàn (đoàn viên, điểm, hoạt động, bí thư, cờ đỏ) không bị ảnh hưởng.</p>
      {!sync?.enabled && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Đồng bộ với Cổng Đoàn đang tắt, nên các quyền dưới đây chưa có hiệu lực. Cổng Đoàn chạy riêng được ghi tự do.</p>}
    </Card>
    <Card className="space-y-3">
      <h3 className="font-medium">Mẫu cài sẵn</h3>
      <div className="grid gap-2 md:grid-cols-3">{PRESET_LIST.map(([key, name, hint]) => (
        <div key={key} className="space-y-2 rounded-lg border p-3"><div className="font-medium">{name}</div><p className="text-xs text-slate-500">{hint}</p>
          <ActionForm action={saveDoanPolicy} submit={`Áp dụng "${name}"`} compact reset={false} confirmText={`Áp dụng mẫu "${name}" cho quyền của Cổng Đoàn?`}><input type="hidden" name="preset" value={key} /></ActionForm></div>
      ))}</div>
    </Card>
    <Card className="space-y-3">
      <h3 className="font-medium">Cho phép Cổng Đoàn ghi</h3>
      <ActionForm action={saveDoanPolicy} submit="Lưu quyền" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
        {GROUPS.map(([key, name, hint]) => <label key={key} className="flex items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" name={key} defaultChecked={p[key]} className="mt-1 size-4" />
          <span><span className="block font-medium">{name}</span><span className="block text-sm text-slate-500">{hint}</span></span>
        </label>)}
      </ActionForm>
      {p.updatedBy && <p className="text-xs text-slate-500">Cập nhật lần cuối bởi {p.updatedBy}.</p>}
    </Card>
  </div>;
}
