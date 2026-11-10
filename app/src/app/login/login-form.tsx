"use client";

import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, User, ArrowRight } from "lucide-react";
import { ModeToggle } from "@/components/layout/mode-toggle";

export function LoginForm({ name, logo }: { name: string; logo: string }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: f.get("username"), password: f.get("password") }),
    });
    if (r.ok) {
      window.location.href = "/";
      return;
    }
    setBusy(false);
    const j = await r.json().catch(() => null);
    setErr(r.status === 403 ? (j?.error ?? "Tài khoản đã bị khoá") : "Sai email hoặc mật khẩu");
  }

  return (
    <main className="auth-background relative flex min-h-screen items-center justify-center p-4 py-12 sm:p-6 sm:py-12 text-[var(--fg)]">
      <div className="absolute top-4 right-4 z-20">
        <ModeToggle />
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
            <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">{name}</h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
              Cổng Quản lý Giáo dục EduConnect
            </p>
          </div>

          {/* Card Đăng nhập */}
          <form
            onSubmit={submit}
            className="space-y-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-black/50"
          >
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Đăng nhập EduConnect</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Đăng nhập bằng tài khoản do nhà trường cấp.
              </p>
            </div>

            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Email hoặc Mã học sinh
              <span className="relative mt-1.5 block">
                <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="username"
                  autoComplete="username"
                  autoFocus
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-10 pr-3.5 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-orange-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-orange-500/15 placeholder:text-slate-400"
                  placeholder="vd: hocsinh1@sonha.edu.vn hoặc HS00000004"
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
                  className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-10 pr-11 text-sm text-slate-900 dark:text-slate-100 outline-none transition focus:border-orange-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-orange-500/15 placeholder:text-slate-400"
                  placeholder="••••••••"
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
                className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-600 dark:text-rose-400 leading-relaxed"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            )}

            <button
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-sm font-semibold text-white shadow-md shadow-orange-600/20 transition disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                "Đăng nhập"
              )}
            </button>

            <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
              Quên mật khẩu? Vui lòng liên hệ Quản trị viên nhà trường để được cấp lại.
            </p>
          </form>

          {/* Thẻ chuyển sang Cổng Phụ huynh */}
          <div className="mt-5 rounded-2xl border border-orange-200/80 dark:border-orange-900/50 bg-white dark:bg-slate-900 hover:border-orange-300 dark:hover:border-orange-800 transition p-4 text-center shadow-xs">
            <a
              href="/phu-huynh/dang-nhap"
              className="group inline-flex items-center justify-center gap-2 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
            >
              <span>Cổng Sổ liên lạc dành riêng cho Phụ huynh</span>
              <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 transition group-hover:translate-x-1" />
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
