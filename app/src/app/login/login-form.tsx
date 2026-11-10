"use client";
import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";

export function LoginForm({ name, logo }: { name: string; logo: string }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.get("username"), password: f.get("password") }) });
    if (r.ok) { window.location.href = "/"; return; }
    setBusy(false);
    const j = await r.json().catch(() => null);
    setErr(r.status === 403 ? (j?.error ?? "Tài khoản đã bị khoá") : "Sai email hoặc mật khẩu");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white p-4 text-slate-900">
      <div aria-hidden="true" className="school-watermark school-watermark-login pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" className="aspect-square w-[min(90vw,800px)] rounded-full object-cover" /> : <span className="text-[60vw] font-bold leading-none">{name.slice(0, 1).toUpperCase()}</span>}
      </div>
      <div className="relative flex w-full justify-center">
        <div className="w-full max-w-[400px] shrink-0">
          <div className="mb-6 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt="" className="size-20 rounded-full object-cover" /> : (
              <div className="theme-sidebar grid size-16 place-items-center rounded-full text-2xl font-bold shadow-md" style={{ color: "var(--sb-fg)" }}>{name.slice(0, 1).toUpperCase()}</div>
            )}
            <h1 className="mt-4 text-xl font-semibold">{name}</h1>
          </div>

          <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-white/90 p-7 shadow-lg backdrop-blur-sm">
            <div>
              <h2 className="text-lg font-semibold">Đăng nhập</h2>
              <p className="text-sm text-slate-500">Nhập tài khoản do nhà trường cấp cho bạn.</p>
            </div>

            <label className="block text-xs font-medium text-slate-600">Email / Mã học sinh
              <span className="relative mt-1 block">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input name="username" autoComplete="username" autoFocus required className="h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25" placeholder="vd: hocsinh1@sonha.edu.vn" />
              </span>
            </label>

            <label className="block text-xs font-medium text-slate-600">Mật khẩu
              <span className="relative mt-1 block">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required className="h-11 w-full rounded-lg border bg-white pl-10 pr-11 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25" placeholder="••••••••" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </label>

            {err && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600"><AlertCircle className="size-4 shrink-0" />{err}</div>}

            <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-60">
              {busy ? <><Loader2 className="size-4 animate-spin" />Đang đăng nhập...</> : "Đăng nhập"}
            </button>

            <p className="text-center text-xs text-slate-500">Học sinh dùng tài khoản do nhà trường cấp. Quên mật khẩu? Liên hệ quản trị viên để được cấp lại.</p>
          </form>

          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-center">
            <a href="/tra-cuu" className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-900 hover:underline">
              🔍 Phụ huynh tra cứu Sổ liên lạc điện tử (không cần tài khoản) →
            </a>
          </div>


        </div>
      </div>
    </main>
  );
}
