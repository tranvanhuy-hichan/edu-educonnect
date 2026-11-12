"use client";
import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { parentLogout, parentSetInitialPassword } from "../actions";

const field = "h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] pl-10 pr-11 text-sm text-[var(--fg)] outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15";

/** Bắt buộc đặt mật khẩu mới trước khi xem Sổ liên lạc. */
export function SetPasswordForm() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await parentSetInitialPassword(new FormData(e.currentTarget));
      if (r.success) { window.location.href = "/phu-huynh"; return; }
      setErr(r.error ?? "Không đặt được mật khẩu.");
    } catch { setErr("Có lỗi xảy ra, vui lòng thử lại."); }
    setBusy(false);
  }

  const input = (name: string, label: string, autoFocus = false) => (
    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
      {label}
      <span className="relative mt-1.5 block">
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input name={name} type={show ? "text" : "password"} autoComplete="new-password" required minLength={8} autoFocus={autoFocus} className={field} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
    <form onSubmit={submit} className="space-y-4">
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">Bạn cần đặt mật khẩu riêng trước khi xem thông tin của học sinh. Mật khẩu tối thiểu 8 ký tự, không dùng số điện thoại hoặc dãy số dễ đoán.</p>
      {input("newPassword", "Mật khẩu mới", true)}
      {input("confirmPassword", "Nhập lại mật khẩu mới")}
      {err && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs leading-relaxed text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{err}</span>
        </div>
      )}
      <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral-600 text-sm font-semibold text-white shadow-md transition hover:bg-coral-700 disabled:opacity-60">
        {busy ? <><Loader2 className="size-4 animate-spin" />Đang lưu...</> : "Lưu mật khẩu và xem Sổ liên lạc"}
      </button>
    </form>
    <form action={parentLogout}><button className="w-full text-center text-xs font-semibold text-slate-600 hover:underline dark:text-slate-400">Đăng xuất</button></form>
    </div>
  );
}
