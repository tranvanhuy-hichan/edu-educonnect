import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageSizeSelect } from "@/components/page-size-select";
import { PAGE_SIZES } from "@/lib/paging";

type Params = Record<string, string | undefined>;

export function Pagination({ total, page, size, path, params = {}, pageKey = "page" }: { total: number; page: number; size: number; path: string; params?: Params; pageKey?: string }) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.max(1, Math.min(page, pages));
  const href = (over: Params) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...over })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - cur) <= 1) nums.push(i); else if (nums[nums.length - 1] !== "…") nums.push("…");
  const from = (cur - 1) * size + 1, to = Math.min(cur * size, total);
  const btn = "h-10 min-w-10 shrink-0 items-center justify-center rounded-md border px-2 text-sm sm:h-9 sm:min-w-9";
  const sizes = [...new Set([...PAGE_SIZES, size])].sort((a, b) => a - b);
  return (
    <nav aria-label="Phân trang" className="pagination mt-4 grid grid-cols-2 items-center gap-3 border-t pt-4 text-sm sm:flex sm:flex-wrap sm:justify-between">
      <p className="text-xs text-slate-500 sm:text-sm"><span className="hidden sm:inline">Hiển thị </span><b className="font-medium text-slate-700">{from}–{to}</b> / {total}</p>
      <div className="justify-self-end sm:order-3"><PageSizeSelect size={size} options={sizes.map((value) => ({ value, href: href({ size: String(value), [pageKey]: "1" }) }))} /></div>
      <div className="col-span-2 flex items-center justify-center gap-2 sm:order-2 sm:gap-1">
        {cur > 1 ? <Link href={href({ [pageKey]: String(cur - 1) })} className={`inline-flex ${btn} bg-white hover:bg-slate-50`} aria-label="Trang trước"><ChevronLeft className="size-4" /></Link> : <span aria-disabled="true" aria-label="Trang trước" className={`inline-flex ${btn} opacity-40`}><ChevronLeft className="size-4" /></span>}
        <span className="min-w-28 text-center text-sm font-medium tabular-nums sm:hidden" aria-live="polite">Trang {cur} / {pages}</span>
        {nums.map((n, i) => n === "…" ? <span key={i} className="hidden px-1 text-slate-400 sm:inline">…</span> : (
          <Link key={i} aria-current={n === cur ? "page" : undefined} aria-label={`Trang ${n}`} href={href({ [pageKey]: String(n) })} className={`${btn} hidden sm:inline-flex ${n === cur ? "border-orange-600 bg-orange-600 font-semibold text-white" : "bg-white hover:bg-slate-50"}`}>{n}</Link>
        ))}
        {cur < pages ? <Link href={href({ [pageKey]: String(cur + 1) })} className={`inline-flex ${btn} bg-white hover:bg-slate-50`} aria-label="Trang sau"><ChevronRight className="size-4" /></Link> : <span aria-disabled="true" aria-label="Trang sau" className={`inline-flex ${btn} opacity-40`}><ChevronRight className="size-4" /></span>}
      </div>
    </nav>
  );
}
