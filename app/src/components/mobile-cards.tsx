import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type MobileCardItem = {
  key: string; href: string;
  lead?: React.ReactNode; // ô nhỏ bên trái (vd số thứ tự)
  title: string; // tên đầy đủ, tự xuống dòng
  subtitle?: string;
  chips?: string[]; // số liệu ngắn dưới tên
};

/** Danh sách thẻ cho điện thoại: tên dài vẫn đọc trọn vẹn. Dùng cùng bảng `hidden md:block` cho màn hình lớn. */
export function MobileCards({ items, empty }: { items: MobileCardItem[]; empty?: string }) {
  if (!items.length) return empty ? <p className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500 md:hidden">{empty}</p> : null;
  return (
    <ul className="space-y-2 md:hidden">
      {items.map((it) => (
        <li key={it.key}>
          <Link href={it.href} className="item-card flex items-start gap-3 rounded-lg border bg-white p-3 transition-colors active:bg-slate-50">
            {it.lead != null && <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-100 text-sm font-semibold text-orange-700">{it.lead}</span>}
            <span className="min-w-0 flex-1">
              <span className="block break-words font-semibold leading-snug">{it.title}</span>
              {it.subtitle && <span className="mt-0.5 block text-xs text-slate-500">{it.subtitle}</span>}
              {!!it.chips?.length && <span className="mt-2 flex flex-wrap gap-1.5">{it.chips.map((c) => <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{c}</span>)}</span>}
            </span>
            <ChevronRight className="mt-2 size-4 shrink-0 text-slate-300" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
