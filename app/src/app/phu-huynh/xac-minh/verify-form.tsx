"use client";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { parentLogout, parentSendSessionOtp, parentVerifySessionOtp } from "../actions";

const field = "h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 text-center text-lg tracking-[0.5em] text-[var(--fg)] outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15";

/** Phụ huynh đã đăng nhập nhưng chưa xác minh số: gửi mã tới số của tài khoản rồi nhập mã. */
export function VerifyPhoneForm({ masked }: { masked: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    setBusy(true); setErr("");
    try {
      const r = await parentSendSessionOtp();
      if (r.ok) setSent(true); else setErr(r.error);
    } catch { setErr("Có lỗi xảy ra, vui lòng thử lại."); }
    setBusy(false);
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await parentVerifySessionOtp(new FormData(e.currentTarget));
      if (r.success) { window.location.href = "/phu-huynh"; return; }
      setErr(r.error ?? "Xác minh không thành công.");
    } catch { setErr("Có lỗi xảy ra, vui lòng thử lại."); }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">Để bảo vệ thông tin của học sinh, nhà trường cần xác minh bạn là chủ số điện thoại <b>{masked}</b> trước khi cho xem Sổ liên lạc. Việc này chỉ cần làm một lần.</p>
      {sent ? (
        <form onSubmit={verify} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Mã xác minh (6 số) đã gửi tới {masked}
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus required className={field + " mt-1.5"} placeholder="••••••" />
          </label>
          <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral-600 text-sm font-semibold text-white shadow-md transition hover:bg-coral-700 disabled:opacity-60">
            {busy ? <><Loader2 className="size-4 animate-spin" />Đang xử lý...</> : "Xác minh"}
          </button>
          <button type="button" disabled={busy} onClick={send} className="w-full text-center text-xs font-semibold text-orange-700 hover:underline disabled:opacity-50 dark:text-orange-400">Gửi lại mã</button>
        </form>
      ) : (
        <button disabled={busy} onClick={send} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral-600 text-sm font-semibold text-white shadow-md transition hover:bg-coral-700 disabled:opacity-60">
          {busy ? <><Loader2 className="size-4 animate-spin" />Đang gửi...</> : `Gửi mã xác minh tới ${masked}`}
        </button>
      )}
      {err && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs leading-relaxed text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{err}</span>
        </div>
      )}
      <form action={parentLogout}><button className="w-full text-center text-xs font-semibold text-slate-600 hover:underline dark:text-slate-400">Đăng xuất</button></form>
    </div>
  );
}
