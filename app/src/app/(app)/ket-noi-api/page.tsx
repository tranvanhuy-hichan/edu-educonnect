import { SystemTabs } from "@/components/system-tabs";
import { requireRole, ADMIN_ROLES } from "@/lib/guard";
import { Card, Table, Title } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { CreateKeyForm, RotateKeyButton } from "@/components/api-key-controls";
import { SCOPES } from "@/modules/apikeys/api-key.scopes";
import * as repo from "@/modules/apikeys/api-key.repository";
import { listChanges } from "@/modules/public-api/write/changes";
import { createKeyAction, revertChangeAction, revokeKeyAction, rotateKeyAction } from "./actions";

const KIND_LABEL: Record<string, string> = { STUDENT_CREATE: "Tạo học sinh", STUDENT_UPDATE: "Sửa học sinh", STUDENT_CLASS: "Chuyển/xếp lớp", YOUTH_UPDATE: "Cập nhật thông tin Đoàn", TEACHER_CREATE: "Tạo giáo viên", TEACHER_UPDATE: "Sửa giáo viên", CLASS_CREATE: "Tạo lớp", CLASS_UPDATE: "Sửa lớp" };
const show = (v: unknown) => (v === null || v === undefined ? "(trống)" : Array.isArray(v) ? v.join(", ") || "(trống)" : String(v));
/** Tóm tắt "trường: trước → sau". Không hiện giá trị nhạy cảm đầy đủ trong danh sách: chỉ tên trường cho nhóm liên hệ/định danh. */
const SENSITIVE = new Set(["phone", "contactEmail", "address", "guardianName", "guardianRelation", "guardianPhone", "guardianEmail", "idNumber", "birthPlace", "ethnicity"]);
function summarize(before: unknown, after: unknown) {
  const b = (before ?? {}) as Record<string, unknown>, a = (after ?? {}) as Record<string, unknown>;
  const changed = Object.keys(a).filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)); // bỏ các trường không đổi (ảnh chụp "sau" của thông tin Đoàn có đủ trường)
  return changed.map((k) => SENSITIVE.has(k) ? `${k}: (đã đổi)` : before == null || b[k] == null ? `${k}: ${show(a[k])}` : `${k}: ${show(b[k])} → ${show(a[k])}`).join("; ");
}

export const dynamic = "force-dynamic";
const fmt = (d: Date | null) => (d ? d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false }) : "—");

export default async function ExternalApi() {
  await requireRole(...ADMIN_ROLES);
  const [keys, usage, changes] = await Promise.all([repo.listKeys(), repo.usageLast24h(), listChanges(60)]);
  const now = new Date().getTime();
  const scopes = Object.entries(SCOPES).map(([value, s]) => ({ value, ...s }));
  const origin = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://<tên-miền-của-trường>");
  return (
    <div className="space-y-4">
      <SystemTabs current="/ket-noi-api" />
      <Title right={<DialogButton label="+ Tạo khoá API" title="Tạo khoá API" width="md"><CreateKeyForm action={createKeyAction} scopes={scopes} /></DialogButton>}>Kết nối ngoài (API)</Title>
      <Card className="space-y-2 text-sm text-slate-600">
        <p>Cấp khoá API để hệ thống bên ngoài (ví dụ hệ thống Đoàn thanh niên) đọc, và nếu được cấp quyền <b>GHI</b> thì tạo/sửa học sinh, giáo viên, lớp và thông tin Đoàn. Mỗi khoá có quyền riêng, có thể giới hạn theo địa chỉ IP, tự hết hạn và thu hồi được ngay.</p>
        <p>Dữ liệu học sinh là thông tin cá nhân của trẻ vị thành niên. Chỉ cấp quyền <b>nhạy cảm</b> (liên hệ, CCCD) và quyền <b>GHI</b> khi có văn bản thoả thuận với đơn vị nhận, và nên giới hạn theo IP của họ.</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`curl -H "Authorization: Bearer ek_xxxxxxxx" \\\n  "${origin}/api/v1/students?grade=<mã khối>&pageSize=100"`}</pre>
        <p>Tài liệu đầy đủ: <code>docs/api-ngoai.md</code> hoặc <a className="text-orange-700 underline" href="/api/docs">/api/docs</a>.</p>
      </Card>
      <Table head={["Khoá", "Quyền", "Giới hạn", "Dùng lần cuối", "24 giờ qua", "Trạng thái", ""]}>
        {keys.map((k) => {
          const expired = !!k.expiresAt && k.expiresAt.getTime() <= now;
          const state = k.revokedAt ? ["Đã thu hồi", "text-slate-500"] : expired ? ["Hết hạn", "text-amber-700"] : ["Đang dùng", "text-green-700"];
          const u = usage.get(k.id) ?? { total: 0, errors: 0 };
          return (
            <tr key={k.id} className={k.revokedAt ? "opacity-60" : ""}>
              <td className="max-w-xs"><div className="font-medium">{k.name}</div><div className="font-mono text-xs text-slate-500">{k.keyPrefix}…</div>{k.note && <div className="text-xs text-slate-500">{k.note}</div>}<div className="text-[11px] text-slate-400">Tạo {fmt(k.createdAt)} bởi {k.createdBy}</div></td>
              <td className="max-w-sm"><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <span key={s} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SCOPES[s as keyof typeof SCOPES]?.sensitive ? "bg-amber-100 text-amber-900" : "bg-slate-100"}`}>{s}</span>)}</div></td>
              <td className="text-xs">{k.rateLimitPerMin}/phút<div className="text-slate-500">{k.ipAllowlist.length ? `IP: ${k.ipAllowlist.join(", ")}` : "Mọi IP"}</div><div className="text-slate-500">{k.expiresAt ? `Hết hạn ${fmt(k.expiresAt)}` : "Không hết hạn"}</div></td>
              <td className="whitespace-nowrap text-xs">{fmt(k.lastUsedAt)}<div className="font-mono text-slate-500">{k.lastUsedIp ?? ""}</div></td>
              <td className="text-xs">{u.total} lần{u.errors > 0 && <span className="text-red-600"> · {u.errors} lỗi</span>}</td>
              <td className={`text-xs font-semibold ${state[1]}`}>{state[0]}</td>
              <td>{!k.revokedAt && (
                <div className="flex gap-2">
                  <RotateKeyButton action={rotateKeyAction} id={k.id} name={k.name} />
                  <ActionForm action={revokeKeyAction} submit="Thu hồi" compact danger reset={false} className="flex" confirmText={`Thu hồi khoá “${k.name}”? Hệ thống đang dùng khoá này sẽ bị từ chối ngay.`}><input type="hidden" name="id" value={k.id} /></ActionForm>
                </div>
              )}</td>
            </tr>
          );
        })}
        {!keys.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Chưa có khoá API nào.</td></tr>}
      </Table>
    
      <section className="space-y-2">
        <h2 className="font-semibold">Thay đổi do hệ thống ngoài thực hiện ({changes.length})</h2>
        <p className="text-sm text-slate-500">Mọi lần ghi qua API đều được lưu tại đây. “Hoàn tác” chỉ thực hiện được khi dữ liệu chưa bị sửa tiếp; học sinh/lớp tạo nhầm được đưa vào Thùng rác.</p>
        <Table head={["Lúc", "Khoá", "Thay đổi", "Đối tượng", "Chi tiết", ""]}>
          {changes.map((c) => (
            <tr key={c.id} className={c.revertedAt ? "opacity-60" : ""}>
              <td className="whitespace-nowrap text-xs">{fmt(c.createdAt)}</td>
              <td className="text-xs">{c.key.name}</td>
              <td className="text-xs font-medium">{KIND_LABEL[c.kind] ?? c.kind}</td>
              <td className="max-w-[14rem] break-words text-sm">{c.label}</td>
              <td className="max-w-md break-words text-xs text-slate-600">{summarize(c.before, c.after)}</td>
              <td>{c.revertedAt ? <span className="text-xs text-slate-500">Đã hoàn tác {fmt(c.revertedAt)}</span> : <ActionForm action={revertChangeAction} submit="Hoàn tác" compact danger reset={false} className="flex" confirmText={`Hoàn tác “${KIND_LABEL[c.kind] ?? c.kind}” (${c.label})? Dữ liệu trở về như trước khi hệ thống ngoài thay đổi.`}><input type="hidden" name="id" value={c.id} /></ActionForm>}</td>
            </tr>
          ))}
          {!changes.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Chưa có thay đổi nào do API thực hiện.</td></tr>}
        </Table>
      </section>
    </div>
  );
}
