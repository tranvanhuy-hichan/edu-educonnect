"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Phone, ShieldCheck } from "lucide-react";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { parentLogin } from "../actions";

export function ParentLoginForm({ name, logo }: { name: string; logo: string }) {
  const router = useRouter();
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
        router.push("/phu-huynh");
        router.refresh();
      } else {
        setBusy(false);
        setErr(res.error ?? "Đăng nhập không thành công.");
      }
    } catch {
      setBusy(false);
      setErr("Đã có lỗi xảy ra trong quá trình đăng nhập. Vui lòng thử lại.");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden theme-bg p-4 text-[var(--fg)]">
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
        <div className="w-full max-w-[430px] shrink-0">
          <div className="mb-6 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? (
              <img
                src={logo}
                alt=""
                className="size-20 rounded-full object-cover shadow-md ring-2 ring-orange-500/30"
              />
            ) : (
              <div
                className="theme-sidebar grid size-16 place-items-center rounded-full text-2xl font-bold shadow-md"
                style={{ color: "var(--sb-fg)" }}
              >
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <h1 className="mt-3 text-xl font-bold tracking-tight text-[var(--fg)]">{name}</h1>
            <p className="mt-1 text-sm font-medium text-orange-600 dark:text-orange-400">
              Cổng Sổ liên lạc điện tử Phụ huynh
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-xl"
          >
            <div>
              <h2 className="text-xl font-bold text-[var(--fg)]">Đăng nhập Phụ huynh</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Tra cứu điểm, rèn luyện, chuyên cần & thông tin học tập của con.
              </p>
            </div>

            <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-3 text-xs text-blue-800 dark:text-blue-300">
              <div className="flex items-start gap-2">
                <ShieldCheck className="size-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                <span>
                  <strong>Lưu ý:</strong> Đăng nhập bằng <strong>Số điện thoại</strong> người giám hộ đã đăng ký với GVCN. Mật khẩu mặc định khởi tạo là <strong>123456</strong>.
                </span>
              </div>
            </div>

            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Số điện thoại người giám hộ
              <span className="relative mt-1 block">
                <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  autoFocus
                  required
                  className="h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] pl-10 pr-3 text-sm text-[var(--fg)] outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25 placeholder:text-slate-400"
                  placeholder="vd: 0912345678"
                />
              </span>
            </label>

            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Mật khẩu
              <span className="relative mt-1 block">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  defaultValue="123456"
                  className="h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] pl-10 pr-11 text-sm text-[var(--fg)] outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25 placeholder:text-slate-400"
                  placeholder="Mặc định: 123456"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </label>

            {err && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-600 dark:text-red-400 leading-relaxed"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            )}

            <button
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
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

            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Quên mật khẩu? Vui lòng liên hệ Giáo viên chủ nhiệm để được cấp lại mật khẩu mặc định (123456).
            </p>
          </form>

          <div className="mt-4 text-center">
            <a
              href="/login"
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:underline"
            >
              ← Quay về Đăng nhập Hệ thống (Cán bộ / GV / Học sinh)
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
