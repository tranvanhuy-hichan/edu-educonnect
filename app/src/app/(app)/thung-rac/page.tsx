import { AutoForm } from "@/components/auto-form";
import { SystemTabs } from "@/components/system-tabs";
import { requireRole, ADMIN_ROLES } from "@/lib/guard";
import { Card, Table, inputCls, Title } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { KIND_LABEL, listTrash } from "@/modules/trash/trash.service";
import { TRASH_DAYS } from "@/modules/trash/trash.repository";
import { purgeTrashItem, restoreTrashItem } from "./actions";

export const dynamic = "force-dynamic";
const fmt = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });

export default async function TrashPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const me = await requireRole(...ADMIN_ROLES);
  const { kind = "" } = await searchParams;
  const [items, all] = await Promise.all([listTrash(me, kind), listTrash(me)]);
  const now = new Date().getTime();
  const count = (k: string) => all.filter((i) => i.kind === k).length;
  return (
    <div className="space-y-4">
      <SystemTabs current="/thung-rac" />
      <Title>Thùng rác</Title>
      <Card className="text-sm text-slate-600">Học sinh, lớp, bài học và câu hỏi bị xoá được giữ <b>{TRASH_DAYS} ngày</b> tại đây, kèm các dữ liệu liên quan (điểm trung bình, bài nộp, xếp lớp…). Khôi phục lại nguyên trạng bằng một nút. Quá hạn sẽ bị xoá vĩnh viễn. Thông báo và phiên đăng nhập của học sinh không được lưu.</Card>
      <AutoForm className="flex flex-wrap items-center gap-2"><label className="flex w-full items-center gap-2 text-sm text-slate-500 sm:w-auto">Loại dữ liệu<select key={kind} name="kind" defaultValue={kind} className={inputCls}><option value="">Tất cả ({all.length})</option>{Object.entries(KIND_LABEL).map(([key,label]) => <option key={key} value={key}>{label} ({count(key)})</option>)}</select></label></AutoForm>
      <Table head={["Loại", "Tên", "Chi tiết", "Xoá bởi", "Xoá lúc", "Còn lại", ""]}>
        {items.map((i) => (
          <tr key={i.id}>
            <td><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">{KIND_LABEL[i.kind] ?? i.kind}</span></td>
            <td className="max-w-xs break-words font-medium">{i.label}</td>
            <td className="max-w-xs break-words text-xs text-slate-600">{i.detail}</td>
            <td className="text-xs">{i.deletedBy}</td>
            <td className="whitespace-nowrap text-xs">{fmt(i.deletedAt)}</td>
            <td className="whitespace-nowrap text-xs">{Math.max(0, Math.ceil((i.expiresAt.getTime() - now) / 86_400_000))} ngày</td>
            <td>
              <div className="flex gap-2">
                <ActionForm action={restoreTrashItem} submit="Khôi phục" compact reset={false} className="flex" confirmText={`Khôi phục “${i.label}”?`}><input type="hidden" name="id" value={i.id} /></ActionForm>
                <ActionForm action={purgeTrashItem} submit="Xoá hẳn" compact danger reset={false} className="flex" confirmText="Xoá vĩnh viễn, không thể khôi phục nữa?"><input type="hidden" name="id" value={i.id} /></ActionForm>
              </div>
            </td>
          </tr>
        ))}
        {!items.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Thùng rác trống.</td></tr>}
      </Table>
    </div>
  );
}
