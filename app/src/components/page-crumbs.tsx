"use client";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };
const noop = () => () => {};

/**
 * Đưa đường dẫn của trang lên thanh topbar (thay cho đoạn "Chi tiết" tự suy ra từ URL).
 * Mục cuối là trang hiện tại. "Trang chủ" luôn do topbar tự hiển thị nên không cần khai báo.
 */
export function PageCrumbs({ items }: { items: Crumb[] }) {
  const ready = useSyncExternalStore(noop, () => true, () => false); // chỉ dựng sau khi vào trình duyệt
  const slot = ready ? document.getElementById("page-crumbs") : null;
  if (!slot) return null;
  return createPortal(
    items.map((c, i) => {
      const last = i === items.length - 1;
      return (
        // Điện thoại: chỉ hiện trang hiện tại (đã có nút quay lại); từ sm trở lên hiện đủ đường dẫn
        <span key={`${i}-${c.label}`} className={`${last ? "flex" : "hidden sm:flex"} min-w-0 items-center gap-1`}>
          <ChevronRight className="hidden size-3.5 shrink-0 sm:block" />
          {last || !c.href ? <span className={`truncate ${last ? "font-medium" : ""}`} style={last ? { color: "var(--fg)" } : undefined}>{c.label}</span> : <Link href={c.href} className="truncate hover:text-orange-700">{c.label}</Link>}
        </span>
      );
    }),
    slot,
  );
}
