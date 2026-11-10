"use client";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

/** Nút "⋯" xổ menu các thao tác của một dòng/thẻ. Đóng khi bấm ra ngoài hoặc nhấn Esc. */
export function ActionMenu({ children, label = "Thao tác", wide = false }: { children: React.ReactNode; label?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-md border bg-white text-slate-600 hover:bg-slate-50">
        <MoreHorizontal className="size-5" />
      </button>
      {open && <div onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }} className={`absolute right-0 top-full z-30 mt-1 max-w-[calc(100vw-2rem)] space-y-1.5 rounded-lg border bg-white p-2 shadow-lg ${wide ? "w-72" : "w-44"}`}>{children}</div>}
    </div>
  );
}
