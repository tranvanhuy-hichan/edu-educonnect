"use client";

import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Phone, ArrowLeft } from "lucide-react";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { parentLogin, parentRequestOtp, parentVerifyOtp } from "../actions";

export function ParentLoginForm({ name, logo, smsEnabled = false }: { name: string; logo: string; smsEnabled?: boolean }) {
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const formData = new FormData(e.currentTarget);
    try {
      const res = await parentLogin(formData);
      if (res.success) {
        window.location.href = "/phu-huynh";
        return;
      } else {
        setBusy(false);
        setErr(res.error ?? "Đăng nhập không thành công.");
      }
    } catch (e: unknown) {
      setBusy(false);
      const msg =
        e instanceof Error
          ? e.message
          : "Đã có lỗi xảy ra trong quá trình đăng nhập. Vui lòng thử lại.";
      setErr(msg);
    }
  }

  return (
    <main className="auth-background relative flex min-h-screen items-center justify-center p-4 py-12 sm:p-6 sm:py-12 text-[var(--fg)]">
      <div className="absolute top-4 right-4 z-20">
        <ModeToggle />
      </div>

      <div
        aria-hidden="true"
        className="school-watermark school-watermark-login pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? (
          <img src={logo} alt="" className="aspect-square w-[min(90vw,800px)] rounded-full object-cover" />
        ) : (
          <span className="text-[60vw] font-bold leading-none">{name.slice(0, 1).toUpperCase()}</span>
        )}
      </div>

      <div className="relative flex w-full justify-center">
        <div className="w-full max-w-[420px] shrink-0">
          {/* Header trường học */}
          <div className="mb-6 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? (
              <img
                src={logo}
                alt=""
                className="size-20 rounded-full object-cover shadow-lg ring-4 ring-orange-500/20"
              />
            ) : (
              <div
                className="theme-sidebar grid size-20 place-items-center rounded-full text-2xl font-bold shadow-lg"
                style={{ color: "var(--sb-fg)" }}
              >
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <h1 className="mt-3 text-xl font-bold tracking-tight text-[var(--fg)] sm:text-2xl">{name}</h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
              Cổng Sổ liên lạc điện tử Phụ huynh
            </p>
          </div>

          {/* Card Đăng nhập Phụ huynh */}
          {mode === "otp" ? <OtpPanel onBack={() => { setMode("password"); setErr(""); }} /> : (
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 sm:p-8 shadow-xl backdrop-blur-md"
          >
            <div className="text-center">
              <h2 className="text-xl font-bold text-[var(--fg)]">Đăng nhập dành cho phụ huynh</h2>
            </div>

            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Số điện thoại người giám hộ hoặc Mã học sinh
              <span className="relative mt-1.5 block">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="phone"
                  autoComplete="tel"
                  autoFocus
                  required
                  className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] pl-10 pr-3.5 text-sm text-[var(--fg)] outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15 placeholder:text-slate-400"
                  placeholder="vd: 0912345678 hoặc HS00000004"
                />
              </span>
            </label>

            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Mật khẩu
              <span className="relative mt-1.5 block">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  defaultValue={smsEnabled ? "" : "123456"}
                  className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] pl-10 pr-11 text-sm text-[var(--fg)] outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15 placeholder:text-slate-400"
                  placeholder={smsEnabled ? "Mật khẩu của bạn" : "Mặc định: 123456"}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 transition"
                  aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </label>

            {err && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-600 dark:text-red-400 leading-relaxed"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            )}

            <button
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral-600 hover:bg-coral-700 active:scale-[0.99] text-sm font-semibold text-white shadow-md shadow-orange-600/20 transition disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Đang xác thực...
                </>
              ) : (
                "Đăng nhập Sổ liên lạc"
              )}
            </button>

            {smsEnabled ? (
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Lần đầu đăng nhập hoặc quên mật khẩu?{" "}
                <button type="button" onClick={() => { setMode("otp"); setErr(""); }} className="font-semibold text-orange-700 hover:underline dark:text-orange-400">Nhận mã xác minh qua SMS</button>
              </p>
            ) : (
              <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                Quên mật khẩu? Vui lòng liên hệ Giáo viên chủ nhiệm để được đặt lại về mặc định (123456).
              </p>
            )}
          </form>
          )}

          {/* Link quay lại */}
          <div className="mt-5 text-center">
            <a
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:underline transition"
            >
              <ArrowLeft className="size-3.5" />
              <span>Quay về Đăng nhập Hệ thống (Cán bộ / GV / Học sinh)</span>
            </a>
          </div>
        </div>
      </div>
      <footer className="absolute inset-x-0 bottom-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
        v1.0.0
      </footer>
    </main>
  );
}

const field = "h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 text-sm text-[var(--fg)] outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15 placeholder:text-slate-400";

/** Lần đầu / quên mật khẩu: nhập số điện thoại → nhận mã SMS → nhập mã. Đúng mã thì vào bước đặt mật khẩu mới. */
function OtpPanel({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | undefined>();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setErr("");
    const fd = new FormData(); fd.set("phone", phone);
    try {
      const r = await parentRequestOtp(fd);
      if (r.ok) { setSentTo(r.sentTo); setStep("code"); } else setErr(r.error);
    } catch { setErr("Có lỗi xảy ra, vui lòng thử lại."); }
    setBusy(false);
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const fd = new FormData(e.currentTarget); fd.set("phone", phone);
    try {
      const r = await parentVerifyOtp(fd);
      if (r.success) { window.location.href = "/phu-huynh"; return; }
      setErr(r.error ?? "Xác minh không thành công.");
    } catch { setErr("Có lỗi xảy ra, vui lòng thử lại."); }
    setBusy(false);
  }

  return (
    <form onSubmit={step === "phone" ? send : verify} className="space-y-5 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-xl backdrop-blur-md sm:p-8">
      <div className="text-center">
        <h2 className="text-xl font-bold text-[var(--fg)]">{step === "phone" ? "Nhận mã xác minh qua SMS" : "Nhập mã xác minh"}</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {step === "phone" ? "Dùng cho lần đầu đăng nhập hoặc khi quên mật khẩu. Mã sẽ gửi tới số điện thoại người giám hộ đã đăng ký với nhà trường." : sentTo ? `Mã gồm 6 số đã gửi tới ${sentTo}. Mã có hiệu lực 5 phút.` : "Nếu số điện thoại đã đăng ký với nhà trường, mã gồm 6 số đã được gửi. Mã có hiệu lực 5 phút."}
        </p>
      </div>
      {step === "phone" ? (
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Số điện thoại người giám hộ hoặc Mã học sinh
          <span className="relative mt-1.5 block">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" autoFocus required className={field + " pl-10"} placeholder="vd: 0912345678 hoặc HS00000004" />
          </span>
        </label>
      ) : (
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Mã xác minh (6 số)
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus required className={field + " mt-1.5 text-center text-lg tracking-[0.5em]"} placeholder="••••••" />
        </label>
      )}
      {err && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs leading-relaxed text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{err}</span>
        </div>
      )}
      <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral-600 text-sm font-semibold text-white shadow-md transition hover:bg-coral-700 disabled:opacity-60">
        {busy ? <><Loader2 className="size-4 animate-spin" />Đang xử lý...</> : step === "phone" ? "Gửi mã xác minh" : "Xác minh"}
      </button>
      <div className="flex items-center justify-between text-xs">
        <button type="button" onClick={onBack} className="font-semibold text-slate-600 hover:underline dark:text-slate-400">← Đăng nhập bằng mật khẩu</button>
        {step === "code" && <button type="button" disabled={busy} onClick={() => send()} className="font-semibold text-orange-700 hover:underline disabled:opacity-50 dark:text-orange-400">Gửi lại mã</button>}
      </div>
    </form>
  );
}
