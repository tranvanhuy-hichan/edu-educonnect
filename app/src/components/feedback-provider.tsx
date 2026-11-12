"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { dismissToast, getServerSnapshot, getSnapshot, resolveConfirm, subscribe, type ConfirmRequest, type Toast, type ToastKind } from "@/lib/feedback";

const KIND: Record<ToastKind, { icon: typeof Info; bar: string; text: string; role: "status" | "alert" }> = {
  success: { icon: CheckCircle2, bar: "bg-emerald-500", text: "text-emerald-600", role: "status" },
  error: { icon: XCircle, bar: "bg-red-500", text: "text-red-600", role: "alert" },
  warning: { icon: TriangleAlert, bar: "bg-amber-500", text: "text-amber-600", role: "status" },
  info: { icon: Info, bar: "bg-sky-500", text: "text-sky-600", role: "status" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const { icon: Icon, bar, text, role } = KIND[toast.kind];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const left = useRef(toast.duration);
  const startedAt = useRef(0);
  const start = () => { startedAt.current = Date.now(); timer.current = setTimeout(() => dismissToast(toast.id), left.current); };
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; left.current = Math.max(800, left.current - (Date.now() - startedAt.current)); };
  useEffect(() => { start(); return () => { if (timer.current) clearTimeout(timer.current); }; }, []);
  return (
    <div role={role} onMouseEnter={stop} onMouseLeave={start} className="toast-item pointer-events-auto relative w-full overflow-hidden rounded-xl border shadow-lg sm:w-[380px]" style={{ background: "var(--surface)", color: "var(--fg)", borderColor: "var(--line)" }}>
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden="true" />
      <div className="flex items-start gap-3 py-3 pl-4 pr-2">
        <Icon className={`mt-0.5 size-5 shrink-0 ${text}`} aria-hidden="true" />
        <p className="min-w-0 flex-1 whitespace-pre-line break-words text-sm leading-snug">{toast.message}</p>
        <button type="button" onClick={() => dismissToast(toast.id)} className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Đóng thông báo"><X className="size-4" /></button>
      </div>
      <span className={`toast-progress absolute bottom-0 left-0 h-0.5 w-full origin-left ${bar} opacity-60`} style={{ animationDuration: `${toast.duration}ms` }} aria-hidden="true" />
    </div>
  );
}

/**
 * Khung chứa thông báo. Dùng popover của trình duyệt (lớp trên cùng) để thông báo luôn hiện TRÊN các hộp thoại đang mở,
 * nếu không lỗi xảy ra trong hộp thoại sẽ bị che mất.
 */
function ToastViewport({ toasts }: { toasts: Toast[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = toasts[toasts.length - 1]?.id;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (el.matches(":popover-open")) el.hidePopover(); // mở lại để nằm trên cùng, kể cả khi vừa có hộp thoại mới mở
      if (toasts.length) el.showPopover();
    } catch { /* trình duyệt cũ: vẫn hiện nhờ position: fixed */ }
  }, [last, toasts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} popover="manual" aria-live="polite" className="pointer-events-none fixed inset-auto bottom-4 right-4 m-0 flex w-auto flex-col items-end gap-2 overflow-visible border-0 bg-transparent p-0 max-sm:bottom-auto max-sm:left-3 max-sm:right-3 max-sm:top-3 max-sm:items-stretch">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}

function ConfirmDialog({ req }: { req: ConfirmRequest | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  const active = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (req && active.current !== req.id) {
      active.current = req.id;
      if (el.open) el.close("switch"); // hộp kế tiếp trong hàng đợi
      el.showModal();
      // Thao tác nguy hiểm: mặc định focus vào "Huỷ" để lỡ nhấn Enter cũng không xoá nhầm
      (req.tone === "danger" ? cancel : ok).current?.focus();
    } else if (!req && el.open) { active.current = null; el.close("done"); }
  }, [req]);
  const danger = req?.tone === "danger";
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title" aria-describedby="confirm-message"
      onCancel={(e) => { e.preventDefault(); if (req) resolveConfirm(req.id, false); }}
      onMouseDown={(e) => { if (e.target === ref.current && req) resolveConfirm(req.id, false); }}
      className="confirm-dialog fixed inset-0 m-auto w-[min(92vw,420px)] overflow-hidden rounded-2xl border p-0 shadow-2xl backdrop:bg-black/50 max-sm:mb-4"
      style={{ background: "var(--surface)", color: "var(--fg)", borderColor: "var(--line)" }}
    >
      {req && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full ${danger ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" : "bg-orange-100 text-orange-700"}`}>{danger ? <AlertTriangle className="size-5" /> : <CircleHelp className="size-5" />}</span>
            <div className="min-w-0 flex-1">
              <h2 id="confirm-title" className="text-base font-semibold leading-snug">{req.title}</h2>
              <p id="confirm-message" className="mt-1.5 whitespace-pre-line break-words text-sm text-slate-600 dark:text-slate-300">{req.message}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button ref={cancel} type="button" onClick={() => resolveConfirm(req.id, false)} className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">{req.cancelLabel}</button>
            <button ref={ok} type="button" onClick={() => resolveConfirm(req.id, true)} className={`h-10 rounded-lg px-5 text-sm font-semibold text-white shadow-sm ${danger ? "bg-red-600 hover:bg-red-700" : "bg-coral-600 hover:bg-coral-700"}`}>{req.confirmLabel}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** Đặt một lần ở layout gốc: hiển thị thông báo và hộp xác nhận cho toàn ứng dụng. */
export function FeedbackProvider() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (<><ToastViewport toasts={state.toasts} /><ConfirmDialog req={state.confirm} /></>);
}
