"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
import type { Res } from "@/lib/action";
import { confirmAction, toast } from "@/lib/feedback";

type Scope = { value: string; label: string; hint: string; sensitive: boolean; write: boolean };
type Action = (p: Res, fd: FormData) => Promise<Res>;

/** Hộp hiển thị khoá gốc MỘT LẦN. Đóng hộp là mất khoá, nên có nút sao chép và cảnh báo rõ. */
function SecretModal({ secret, title, onClose }: { secret: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); toast.success("Đã sao chép khoá API."); }
    catch { toast.error("Không sao chép được. Hãy bôi đen khoá và sao chép thủ công."); }
  };
  // <dialog> mở bằng showModal() nằm ở lớp trên cùng của trình duyệt nên luôn hiện TRÊN hộp thoại "Tạo khoá" đang mở (z-index không thắng được lớp này).
  // Vẽ vào <body> (portal) để không thừa hưởng căn lề, cỡ chữ, white-space của ô bảng nơi nút Xoay khoá nằm.
  // Esc và bấm nền bị chặn: lỡ tay đóng hộp là mất khoá vĩnh viễn.
  return createPortal(
    <dialog ref={ref} aria-label={title} onCancel={(e) => e.preventDefault()}
      className="fixed inset-0 m-auto w-[min(94vw,32rem)] overflow-hidden rounded-2xl border p-0 text-left text-sm font-normal normal-case tracking-normal whitespace-normal shadow-2xl backdrop:bg-black/60"
      style={{ background: "var(--surface)", color: "var(--fg)", borderColor: "var(--line)" }}>
      <div className="p-5 sm:p-6">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:bg-transparent dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>Khoá chỉ hiện <b>một lần duy nhất</b>. Hãy sao chép và cất vào nơi an toàn ngay bây giờ. Mất khoá thì chỉ có cách thu hồi và cấp khoá mới.</p>
        </div>
        <code className="mt-3 block break-all rounded-lg border bg-slate-50 p-3 text-left font-mono text-sm dark:bg-slate-900" data-testid="api-secret">{secret}</code>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={copy} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">{copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}{copied ? "Đã sao chép" : "Sao chép khoá"}</button>
          <button type="button" onClick={onClose} className="h-10 rounded-lg bg-coral-600 px-5 text-sm font-semibold text-white hover:bg-coral-700">Tôi đã lưu khoá</button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

const field = "h-9 w-full rounded-md border bg-white px-3 text-sm";

export function CreateKeyForm({ action, scopes }: { action: Action; scopes: Scope[] }) {
  const [res, run, pending] = useActionState(action, null);
  // Khoá gốc lấy thẳng từ kết quả của action; đóng hộp là "quên" kết quả đó (không lưu ở đâu khác).
  const [closed, setClosed] = useState<Res>(null);
  const secret = res?.data?.secret && closed !== res ? res.data.secret : null;
  useEffect(() => { if (res?.error) toast.error(res.error); }, [res]);
  return (
    <>
      <form action={run} className="flex flex-col gap-4 text-sm">
        <label className="space-y-1"><span className="block text-xs font-semibold">Tên khoá (ai dùng khoá này)</span><input name="name" required minLength={2} maxLength={80} className={field} placeholder="vd: Hệ thống Đoàn thanh niên" /></label>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-semibold">Quyền được cấp (chỉ cấp những gì thật sự cần)</legend>
          {[...scopes.filter((s) => !s.write), ...scopes.filter((s) => s.write)].map((s, i, all) => (
            <div key={s.value} className="space-y-2">
              {s.write && !all[i - 1]?.write && <p className="pt-2 text-xs font-bold uppercase tracking-wide text-red-700">Quyền GHI dữ liệu — rủi ro cao hơn: hệ thống ngoài có thể tạo và sửa hồ sơ (mọi thay đổi đều có nhật ký và hoàn tác được)</p>}
              <label className={`flex items-start gap-2 rounded-lg border p-2.5 ${s.write ? "border-red-300 bg-red-50/60 dark:bg-transparent" : s.sensitive ? "border-amber-300 bg-amber-50/60 dark:bg-transparent" : ""}`}>
                <input type="checkbox" name="scopes" value={s.value} className="mt-0.5 size-4" />
                <span><b>{s.label}</b>{s.sensitive && <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${s.write ? "bg-red-200 text-red-900" : "bg-amber-200 text-amber-900"}`}>{s.write ? "Ghi" : "Nhạy cảm"}</span>}<span className="block text-xs text-slate-600">{s.hint}</span></span>
              </label>
            </div>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1"><span className="block text-xs font-semibold">Hết hạn sau</span><select name="expiresInDays" defaultValue="365" className={field}><option value="90">90 ngày</option><option value="180">180 ngày</option><option value="365">1 năm</option><option value="">Không hết hạn</option></select></label>
          <label className="space-y-1"><span className="block text-xs font-semibold">Giới hạn (yêu cầu/phút)</span><input name="rateLimitPerMin" type="number" min={10} max={1000} defaultValue={120} className={field} /></label>
        </div>
        <label className="space-y-1"><span className="block text-xs font-semibold">Chỉ cho phép các địa chỉ IP này (tuỳ chọn, mỗi dòng một địa chỉ hoặc dải 113.161.0.0/16)</span><textarea name="ipAllowlist" rows={2} className="w-full rounded-md border bg-white p-2 text-sm" placeholder="Để trống = cho phép mọi IP (kém an toàn hơn)" /></label>
        <label className="space-y-1"><span className="block text-xs font-semibold">Ghi chú (tuỳ chọn)</span><input name="note" maxLength={300} className={field} placeholder="vd: Liên hệ anh A, Đoàn trường, 09xx..." /></label>
        <button disabled={pending} className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-md bg-coral-600 px-5 text-sm font-medium text-white hover:bg-coral-700 disabled:opacity-50"><KeyRound className="size-4" />{pending ? "Đang tạo..." : "Tạo khoá API"}</button>
      </form>
      {secret && <SecretModal secret={secret} title="Khoá API mới" onClose={() => { setClosed(res); window.location.reload(); }} />}
    </>
  );
}

/** Xoay khoá: tạo khoá mới cùng cấu hình, thu hồi khoá cũ. Có xác nhận vì hệ thống bên ngoài sẽ ngừng chạy cho đến khi đổi sang khoá mới. */
export function RotateKeyButton({ action, id, name }: { action: Action; id: string; name: string }) {
  const [res, run, pending] = useActionState(action, null);
  // Khoá gốc lấy thẳng từ kết quả của action; đóng hộp là "quên" kết quả đó (không lưu ở đâu khác).
  const [closed, setClosed] = useState<Res>(null);
  const secret = res?.data?.secret && closed !== res ? res.data.secret : null;
  useEffect(() => { if (res?.error) toast.error(res.error); }, [res]);
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (confirmed.current) { confirmed.current = false; return; }
    e.preventDefault();
    void confirmAction({ title: "Xoay khoá API?", message: `Khoá hiện tại của “${name}” sẽ bị thu hồi NGAY và một khoá mới được tạo. Hệ thống bên ngoài sẽ bị từ chối cho đến khi bạn đưa khoá mới cho họ.`, confirmLabel: "Xoay khoá", tone: "danger" }).then((ok) => {
      if (ok) { confirmed.current = true; form.current?.requestSubmit(); }
    });
  }
  return (
    <>
      <form ref={form} action={run} onSubmit={onSubmit} className="inline-flex">
        <input type="hidden" name="id" value={id} />
        <button disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"><RefreshCw className="size-3.5" />Xoay khoá</button>
      </form>
      {secret && <SecretModal secret={secret} title="Khoá API mới (khoá cũ đã bị thu hồi)" onClose={() => { setClosed(res); window.location.reload(); }} />}
    </>
  );
}
