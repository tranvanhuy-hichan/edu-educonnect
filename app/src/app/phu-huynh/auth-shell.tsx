import { ModeToggle } from "@/components/layout/mode-toggle";

/** Khung chung cho các trang xác minh / đặt mật khẩu của phụ huynh (cùng giao diện trang đăng nhập). */
export function ParentAuthShell({ name, logo, title, children }: { name: string; logo: string; title: string; children: React.ReactNode }) {
  return (
    <main className="auth-background relative flex min-h-screen items-center justify-center p-4 py-12 text-[var(--fg)] sm:p-6">
      <div className="absolute right-4 top-4 z-20"><ModeToggle /></div>
      <div className="relative w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" className="size-16 rounded-full object-cover shadow-lg ring-4 ring-orange-500/20" /> : <div className="theme-sidebar grid size-16 place-items-center rounded-full text-xl font-bold shadow-lg" style={{ color: "var(--sb-fg)" }}>{name.slice(0, 1).toUpperCase()}</div>}
          <h1 className="mt-3 text-lg font-bold tracking-tight sm:text-xl">{name}</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">Cổng Sổ liên lạc điện tử Phụ huynh</p>
        </div>
        <section className="space-y-5 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-xl sm:p-8">
          <h2 className="text-center text-xl font-bold">{title}</h2>
          {children}
        </section>
      </div>
    </main>
  );
}
