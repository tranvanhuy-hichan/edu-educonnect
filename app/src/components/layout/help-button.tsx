"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, X } from "lucide-react";
import type { Role } from "@prisma/client";
import { HELP_TIP, guidesFor, helpFor } from "@/lib/help-content";
import { finishOnboarding } from "@/app/(app)/huong-dan/actions";

/**
 * Nút “?” trên thanh trên cùng: hướng dẫn riêng cho trang đang mở và hướng dẫn theo vai trò.
 * Lần đầu đăng nhập tự mở phần theo vai trò (một lần cho mỗi tài khoản).
 */
export function HelpButton({ roles, showOnboarding }: { roles: Role[]; showOnboarding: boolean }) {
  const path = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"page" | "role">(showOnboarding ? "role" : "page");
  const [welcome, setWelcome] = useState(showOnboarding);
  const entry = helpFor(path);
  const guides = guidesFor(roles);

  // Lần đầu đăng nhập: tự mở hộp thoại ở phần theo vai trò.
  useEffect(() => {
    if (showOnboarding) ref.current?.showModal();
  }, [showOnboarding]);

  const open = () => { setTab(entry ? "page" : "role"); ref.current?.showModal(); };
  const close = () => ref.current?.close();
  const onClose = () => {
    if (welcome) { setWelcome(false); finishOnboarding().catch(() => undefined); }
  };

  return (
    <>
      <button type="button" onClick={open} className="rounded-md p-2 hover:bg-slate-100" aria-label="Hướng dẫn sử dụng" title="Hướng dẫn sử dụng"><CircleHelp className="size-5" /></button>
      <dialog
        ref={ref} onClose={onClose} onMouseDown={(e) => { if (e.target === ref.current) close(); }} aria-labelledby="help-title"
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(96vw,640px)] flex-col overflow-hidden rounded-xl border bg-white p-0 shadow-2xl open:flex backdrop:bg-black/50 max-sm:mb-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
        style={{ color: "var(--fg)", background: "var(--surface)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3">
          <h2 id="help-title" className="text-base font-semibold">{welcome && tab === "role" ? "Chào mừng bạn đến với EduConnect" : "Hướng dẫn sử dụng"}</h2>
          <button type="button" onClick={close} className="rounded-md p-1.5 hover:bg-slate-100" aria-label="Đóng"><X className="size-5" /></button>
        </div>
        <div className="flex shrink-0 gap-1 border-b px-4 pt-2 text-sm" role="tablist">
          {entry && <button role="tab" aria-selected={tab === "page"} onClick={() => setTab("page")} className={`rounded-t-md px-3 py-2 font-medium ${tab === "page" ? "border-b-2 border-orange-600 text-orange-700" : "text-slate-500 hover:text-slate-800"}`}>Trang này</button>}
          <button role="tab" aria-selected={tab === "role" || !entry} onClick={() => setTab("role")} className={`rounded-t-md px-3 py-2 font-medium ${tab === "role" || !entry ? "border-b-2 border-orange-600 text-orange-700" : "text-slate-500 hover:text-slate-800"}`}>Theo vai trò của bạn</button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {tab === "page" && entry ? (
            <>
              <div><h3 className="text-base font-semibold">{entry.title}</h3><p className="mt-1 text-slate-600">{entry.summary}</p></div>
              <ol className="list-decimal space-y-2 pl-5">{entry.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {entry.tips && <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-900 dark:bg-transparent dark:text-orange-300"><b>Lưu ý:</b><ul className="mt-1 list-disc space-y-1 pl-5">{entry.tips.map((t) => <li key={t}>{t}</li>)}</ul></div>}
            </>
          ) : (
            guides.map((g) => (
              <section key={g.role} className="space-y-2">
                <div><h3 className="text-base font-semibold">{g.title}</h3><p className="text-slate-600">{g.intro}</p></div>
                <ol className="space-y-2">
                  {g.steps.map((s, i) => (
                    <li key={s.title} className="flex gap-3 rounded-lg border p-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-orange-100 text-xs font-bold text-orange-800">{i + 1}</span>
                      <div className="min-w-0"><div className="font-medium">{s.href ? <Link href={s.href} onClick={close} className="hover:text-orange-700 hover:underline">{s.title}</Link> : s.title}</div><p className="text-slate-600">{s.text}</p></div>
                    </li>
                  ))}
                </ol>
              </section>
            ))
          )}
          <p className="text-xs text-slate-500">{HELP_TIP}</p>
        </div>
        <div className="flex shrink-0 justify-end border-t px-5 py-3"><button type="button" onClick={close} className="h-9 rounded-md bg-coral-600 px-5 text-sm font-medium text-white hover:bg-coral-700">{welcome ? "Đã hiểu, bắt đầu" : "Đóng"}</button></div>
      </dialog>
    </>
  );
}
