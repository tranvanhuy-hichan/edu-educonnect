"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import type { NavGroup, NavItem } from "@/lib/nav";

type Group = { key: string; label: string; listHref: string; items: { id: string; label: string; sub: string; href: string }[]; more: boolean };
type Row = { key: string; href: string; label: string; sub: string; section: string };

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
const flatten = (items: NavItem[]): NavItem[] => items.flatMap((i) => [i, ...(i.children ? flatten(i.children) : [])]);
const DEBOUNCE_MS = 220;

/**
 * Ô tìm kiếm trên thanh trên cùng (chỉ máy tính). Gõ tới đâu hiện kết quả tới đó:
 * trang trong menu (lọc ngay trên máy) + học sinh, giáo viên, lớp, tài khoản (máy chủ lọc theo quyền của bạn).
 * Phím tắt: "/" hoặc Ctrl/⌘+K để vào ô; ↑ ↓ chọn, Enter mở, Esc đóng.
 */
export function GlobalSearch({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Kết quả máy chủ kèm theo từ khoá đã hỏi: chỉ dùng khi còn khớp với ô nhập, nên không cần reset thủ công khi gõ tiếp.
  const [answer, setAnswer] = useState<{ term: string; groups: Group[]; failed: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim();

  const pages = useMemo(() => {
    const seen = new Set<string>();
    return groups.flatMap((g) => flatten(g.items)).filter((i) => (seen.has(i.href) ? false : seen.add(i.href)));
  }, [groups]);

  // Gọi máy chủ sau khi ngừng gõ một chút; huỷ lượt cũ khi gõ tiếp để kết quả cũ không đè kết quả mới.
  useEffect(() => {
    if (term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (!r.ok) throw new Error(String(r.status));
        setAnswer({ term, groups: ((await r.json()) as { groups: Group[] }).groups, failed: false });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setAnswer({ term, groups: [], failed: true });
      }
    }, DEBOUNCE_MS);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term]);

  const current = answer && answer.term === term ? answer : null;
  const remote = current?.groups ?? [];
  const state: "idle" | "loading" | "error" = term.length < 2 ? "idle" : !current ? "loading" : current.failed ? "error" : "idle";

  const rows = useMemo<Row[]>(() => {
    if (!term) return [];
    const f = fold(term);
    const nav: Row[] = pages.filter((p) => fold(p.label).includes(f)).slice(0, 5).map((p) => ({ key: `p:${p.href}`, href: p.href, label: p.label, sub: "", section: "Trang" }));
    const people: Row[] = remote.flatMap((g) => [
      ...g.items.map((i) => ({ key: `${g.key}:${i.id}`, href: i.href, label: i.label, sub: i.sub, section: g.label })),
      ...(g.more ? [{ key: `${g.key}:all`, href: g.listHref, label: `Xem tất cả kết quả trong ${g.label}`, sub: "", section: g.label }] : []),
    ]);
    return [...nav, ...people];
  }, [term, pages, remote]);

  const at = Math.min(active, Math.max(rows.length - 1, 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); input.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);

  const go = (r: Row | undefined) => {
    if (!r) return;
    setOpen(false); setQ(""); setActive(0); input.current?.blur();
    router.push(r.href);
  };

  return (
    <div ref={box} className="no-print relative hidden w-56 shrink-0 md:block lg:w-72">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      {state === "loading" && <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); go(rows[at]); }
          else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
        }}
        type="text"
        placeholder="Tìm trang, học sinh, giáo viên... ( / )"
        aria-label="Tìm kiếm"
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-controls="global-search-list"
        autoComplete="off"
        className="h-9 w-full rounded-md border bg-white pl-8 pr-8 text-sm placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
      />
      {open && term && (
        <ul id="global-search-list" role="listbox" className="absolute right-0 z-40 mt-1 max-h-[26rem] w-[24rem] overflow-y-auto rounded-md border bg-white p-1 shadow-lg">
          {rows.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === at}>
              {(i === 0 || rows[i - 1].section !== r.section) && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{r.section}</div>}
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r)} className={`flex w-full flex-col rounded px-3 py-1.5 text-left text-sm ${i === at ? "bg-orange-50 text-orange-800" : "hover:bg-slate-100"}`}>
                <span className="truncate">{r.label}</span>
                {r.sub && <span className="truncate text-xs text-slate-500">{r.sub}</span>}
              </button>
            </li>
          ))}
          {!rows.length && state !== "loading" && <li className="px-3 py-2 text-sm text-slate-500">{state === "error" ? "Không tìm được lúc này, thử lại sau." : term.length < 2 ? "Gõ ít nhất 2 ký tự để tìm học sinh, giáo viên..." : "Không có kết quả."}</li>}
          {!rows.length && state === "loading" && <li className="px-3 py-2 text-sm text-slate-500">Đang tìm...</li>}
        </ul>
      )}
    </div>
  );
}
