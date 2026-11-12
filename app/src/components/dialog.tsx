"use client";
import { createContext, useContext, useId, useRef } from "react";
import { X } from "lucide-react";

const Ctx = createContext<(() => void) | null>(null);
/** Form trong hộp thoại gọi hàm này để tự đóng sau khi lưu thành công; cũng cho biết form đang nằm trong hộp thoại. */
export const useDialogClose = () => useContext(Ctx);

/** Chiều rộng hộp thoại (màn hình lớn). Điện thoại luôn là tờ giấy kéo từ đáy, rộng hết màn hình. */
export type DialogWidth = "sm" | "md" | "lg" | "xl";
const WIDTH: Record<DialogWidth, number> = { sm: 460, md: 600, lg: 960, xl: 1200 };

/**
 * Khung hộp thoại dùng chung:
 * - cao tối đa theo `dvh` (không bị thanh địa chỉ trình duyệt điện thoại che), phần nội dung tự cuộn, tiêu đề cố định;
 * - nút lưu của ActionForm nằm trên thanh cố định ở đáy nên luôn thấy được dù form dài;
 * - khóa cuộn trang phía sau khi đang mở.
 */
function Shell({ dialogRef, title, width, children }: { dialogRef: React.RefObject<HTMLDialogElement | null>; title: string; width: DialogWidth; children: React.ReactNode }) {
  const titleId = useId();
  const close = () => dialogRef.current?.close();
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onMouseDown={(e) => { if (e.target === dialogRef.current) close(); }}
      onClose={() => { document.body.style.overflow = ""; }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(96vw,var(--dlg-w))] flex-col overflow-hidden rounded-xl border bg-white p-0 shadow-2xl open:flex backdrop:bg-black/50 max-sm:mb-0 max-sm:max-h-[94dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
      style={{ "--dlg-w": `${WIDTH[width]}px`, color: "var(--fg)", background: "var(--surface)" } as React.CSSProperties}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3 sm:px-6">
        <h2 id={titleId} className="min-w-0 text-base font-semibold leading-snug">{title}</h2>
        <button type="button" onClick={close} className="shrink-0 rounded-md p-1.5 hover:bg-slate-100" aria-label="Đóng"><X className="size-5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        <Ctx.Provider value={close}>{children}</Ctx.Provider>
      </div>
    </dialog>
  );
}

function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const open = () => { ref.current?.showModal(); document.body.style.overflow = "hidden"; };
  return { ref, open };
}

export function DialogButton({
  label, title, children, wide = false, width, variant = "primary", size = "md", block = false,
}: { label: React.ReactNode; title: string; children: React.ReactNode; wide?: boolean; width?: DialogWidth; variant?: "primary" | "secondary" | "ghost"; size?: "md" | "sm"; block?: boolean }) {
  const { ref, open } = useDialog();
  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors ${block ? "h-9 w-full px-2 text-sm" : size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm"} ${variant === "primary" ? "bg-coral-600 text-white hover:bg-coral-700" : variant === "ghost" ? "text-orange-700 hover:bg-orange-50" : "border bg-white hover:bg-slate-50"}`}
      >
        {label}
      </button>
      <Shell dialogRef={ref} title={title} width={width ?? (wide ? "lg" : "md")}>{children}</Shell>
    </>
  );
}

/** Bấm vào một khối bất kỳ (vd: ô lịch) để mở hộp thoại. */
export function DialogTrigger({
  trigger, title, children, className = "", style, wide = false, width,
}: { trigger: React.ReactNode; title: string; children: React.ReactNode; className?: string; style?: React.CSSProperties; wide?: boolean; width?: DialogWidth }) {
  const { ref, open } = useDialog();
  return (
    <>
      <button type="button" onClick={open} className={className} style={style}>{trigger}</button>
      <Shell dialogRef={ref} title={title} width={width ?? (wide ? "lg" : "md")}>{children}</Shell>
    </>
  );
}
