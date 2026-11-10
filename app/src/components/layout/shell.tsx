"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, KeyRound, LogOut, Menu, X } from "lucide-react";
import clsx from "clsx";
import { buildNav, buildMobileNav, ROLE_LABEL, titleOf, type NavGroup, type NavItem } from "@/lib/nav";
import type { Role } from "@/lib/guard";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";

const HOMEROOM_MAIN_TABS = [null, "overview", "students"];
const LIBRARY_MAIN_TABS = [null, "", "titles"];
/** Mục menu có thể kèm "?tab=…" (vd các chức năng của lớp chủ nhiệm, thư viện): so cả đường dẫn lẫn tab hiện tại. */
const isActive = (path: string, href: string, tab: string | null = null) => {
  const [base, query] = href.split("?");
  if (query) {
    const qTab = new URLSearchParams(query).get("tab");
    if (path === base) {
      if (base === "/thu-vien" && qTab === "titles") {
        return tab === "titles" || !tab;
      }
      return qTab === tab;
    }
    return false;
  }
  if (href === "/") return path === "/";
  if (href === "/lop-chu-nhiem") return path === href && HOMEROOM_MAIN_TABS.includes(tab);
  if (href === "/thu-vien") return path === href && LIBRARY_MAIN_TABS.includes(tab);
  return path === href || path.startsWith(href + "/");
};

function Brand({ name, logo, compact = false, sub = "Hệ thống quản lý giáo dục" }: { name: string; logo: string; compact?: boolean; sub?: string }) {
  return (
    <div className={clsx("flex min-w-0 items-center gap-3 px-4 py-4", compact ? "border-b sb-line" : "flex-1")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" /> : <div className="h-9 w-9 rounded-full bg-white/20 grid place-items-center font-bold shrink-0">{name.slice(0, 1).toUpperCase()}</div>}
      <div className={clsx("min-w-0 leading-tight", compact && "hidden lg:block")}><div className="text-[13px] font-semibold truncate">{name}</div><div className="truncate text-xs sb-muted">{sub}</div></div>
    </div>
  );
}

function Group({ it, path, onNavigate, compact }: { it: NavItem; path: string; onNavigate?: () => void; compact?: boolean }) {
  const tab = useSearchParams().get("tab");
  const kids = it.children!;
  const hasActive = kids.some((k) => isActive(path, k.href, tab));
  const [open, setOpen] = useState(hasActive);
  const [previousActive, setPreviousActive] = useState(hasActive);
  if (previousActive !== hasActive) {
    setPreviousActive(hasActive);
    if (hasActive) setOpen(true);
  }
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} title={it.label} aria-expanded={open} data-active={hasActive && !open}
        className="nav-item relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors">
        <it.icon className="size-[18px] shrink-0" />
        <span className={clsx("flex-1 truncate text-left", compact && "hidden lg:inline")}>{it.label}</span>
        <ChevronDown className={clsx("size-4 shrink-0 transition-transform", open && "rotate-180", compact && "hidden lg:block")} />
      </button>
      {open && (
        <div className={clsx("mt-0.5 space-y-0.5", "lg:ml-5 lg:border-l sb-line lg:pl-2")}>
          {kids.map((k) => (
            <Link key={k.href} href={k.href} onClick={onNavigate} title={k.label} data-active={isActive(path, k.href, tab)}
              className="nav-item relative flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors">
              <k.icon className="size-4 shrink-0" />
              <span className={clsx("flex-1 truncate", compact && "hidden lg:inline")}>{k.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Links({ groups, path, badges, onNavigate, compact }: { groups: NavGroup[]; path: string; badges: Record<string, number>; onNavigate?: () => void; compact?: boolean }) {
  const tab = useSearchParams().get("tab");
  return (
    <>
      {groups.map((g, i) => (
        <div key={i} className="mb-2">
          {g.title && <div className={clsx("px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider sb-muted", compact && "hidden lg:block")}>{g.title}</div>}
          <div className="space-y-0.5">
            {g.items.map((it) => it.children ? (
              <Group key={it.href} it={it} path={path} onNavigate={onNavigate} compact={compact} />
            ) : (
              <Link key={it.href} href={it.href} onClick={onNavigate} title={it.label} data-active={isActive(path, it.href, tab)}
                className="nav-item relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors">
                <it.icon className="size-[18px] shrink-0" />
                <span className={clsx("flex-1 truncate", compact && "hidden lg:inline")}>{it.label}</span>
                {!!badges[it.href] && <span className="rounded-full bg-yellow-300 px-1.5 text-[11px] leading-5 font-bold text-slate-900">{badges[it.href]}</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function Shell({ roles, userName, name, logo, mustChange, children }: { roles: Role[]; userName: string; name: string; logo: string; mustChange: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  const router = useRouter();
  // Gói đã hết hạn: chỉ còn trang gia hạn (và đổi mật khẩu).
  const groups = buildNav(roles);
  const roleLabel = roles.map((r) => ROLE_LABEL[r]).join(" · ");
  const badges: Record<string, number> = {};
  const [drawerState, setDrawerState] = useState({ path, open: false });
  const drawer = drawerState.path === path && drawerState.open;
  const setDrawer = (open: boolean) => setDrawerState({ path, open });
  if (drawerState.path !== path) setDrawerState({ path, open: false });
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const locked = mustChange && path !== "/doi-mat-khau";
  useEffect(() => {
    if (!drawer) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerState({ path, open: false });
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [drawer, path]);
  useEffect(() => { if (locked) router.replace("/doi-mat-khau"); }, [locked, path, router]);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const segs = path.split("/").filter(Boolean);
  const crumbs = segs.map((s, i) => ({ href: "/" + segs.slice(0, i + 1).join("/"), label: titleOf(s, roles) ?? (i > 0 ? "Chi tiết" : "") })).filter((c) => c.label);
  const mobile = buildMobileNav(roles);

  return (
    <div className="min-h-screen">
      <aside className="no-print theme-sidebar fixed inset-y-0 left-0 z-30 hidden w-16 flex-col md:flex lg:w-60" style={{ color: "var(--sb-fg)" }}>
        <Brand name={name} logo={logo} compact />
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Điều hướng chính"><Links groups={groups} path={path} badges={badges} compact /></nav>
        <div className="border-t sb-line p-3 text-xs sb-muted hidden lg:block truncate">{userName} · {roleLabel}</div>
      </aside>

      <div className="md:pl-16 lg:pl-60 flex min-h-screen flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-white px-3 md:px-6">
          <button onClick={() => setDrawer(true)} className="md:hidden p-2 -ml-1" aria-label="Menu"><Menu className="size-5" /></button>
          {path !== "/" && (
            <button
              onClick={() => (window.history.length > 1 ? router.back() : router.push(crumbs.length > 1 ? crumbs[crumbs.length - 2].href : "/"))}
              className="mr-1 grid size-8 shrink-0 place-items-center rounded-md border hover:bg-slate-100" aria-label="Quay lại" title="Quay lại"
            ><ArrowLeft className="size-4" /></button>
          )}
          <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-slate-500" aria-label="Breadcrumb">
            <Link href="/" className="hidden whitespace-nowrap hover:text-orange-700 sm:inline">Trang chủ</Link>
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1 min-w-0">
                <ChevronRight className={`size-3.5 shrink-0 ${i === 0 ? "hidden sm:block" : ""}`} />
                {i === crumbs.length - 1 ? <span className="truncate font-medium" style={{ color: "var(--fg)" }}>{c.label}</span> : <Link href={c.href} className="hover:text-orange-700 truncate">{c.label}</Link>}
              </span>
            ))}
          </nav>
          <NotificationBell />
          <ModeToggle />
          <div className="relative" ref={ref}>
            <button onClick={() => setMenu((o) => !o)} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100">
              <span className="grid size-8 place-items-center rounded-full bg-orange-100 text-sm font-semibold text-orange-800">{userName.slice(0, 1).toUpperCase()}</span>
              <span className="hidden sm:block text-left leading-tight"><span className="block text-[13px] font-medium max-w-32 truncate">{userName}</span><span className="block text-[11px] text-slate-500">{roleLabel}</span></span>
            </button>
            {menu && (
              <div className="absolute right-0 mt-1 w-52 rounded-md border bg-white p-1 shadow-lg">
                <Link href="/doi-mat-khau" className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-slate-100"><KeyRound className="size-4" />Đổi mật khẩu</Link>
                <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-red-600 hover:bg-slate-100"><LogOut className="size-4" />Đăng xuất</button>
              </div>
            )}
          </div>
        </header>
        {mustChange && path !== "/doi-mat-khau" && (
          <div className="no-print bg-yellow-100 px-4 py-2 text-sm text-yellow-900">Bạn đang dùng mật khẩu tạm thời — hãy đổi mật khẩu để tiếp tục sử dụng hệ thống.</div>
        )}
        <main className="relative isolate w-full flex-1 min-w-0 p-4 pb-24 md:p-6 md:pb-6 lg:px-8">
          {logo && (
            <div aria-hidden="true" className="school-watermark no-print pointer-events-none fixed inset-x-0 bottom-0 top-14 z-0 flex items-center justify-center overflow-hidden md:left-16 lg:left-60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" className="aspect-square w-[min(70vw,560px)] shrink-0 rounded-full object-cover" />
            </div>
          )}
          <div className="relative z-10">{locked ? <p className="text-sm text-slate-500">Đang chuyển trang...</p> : children}</div>
        </main>
      </div>

      {/* Mobile: thanh dưới + ngăn kéo */}
      <nav aria-label="Điều hướng nhanh" className="mobile-bottom-nav no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-white md:hidden">
        {mobile.map((it) => (
          <Link key={it.href} href={it.href} aria-current={isActive(path, it.href, tab) ? "page" : undefined} className={clsx("flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px]", isActive(path, it.href, tab) ? "font-semibold text-orange-700" : "text-slate-500")}>
            <it.icon className="size-[22px]" strokeWidth={isActive(path, it.href, tab) ? 2.4 : 1.8} /><span className="truncate max-w-full px-0.5">{it.label}</span>
          </Link>
        ))}
      </nav>
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside onClick={(e) => e.stopPropagation()} className="theme-sidebar absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col" style={{ color: "var(--sb-fg)" }}>
            <div className="flex shrink-0 items-center border-b sb-line pr-2"><Brand name={name} logo={logo} /><button onClick={() => setDrawer(false)} className="grid size-10 shrink-0 place-items-center rounded-md" aria-label="Đóng menu"><X className="size-5" /></button></div>
            <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Điều hướng trên điện thoại"><Links groups={groups} path={path} badges={badges} onNavigate={() => setDrawer(false)} /></nav>
          </aside>
        </div>
      )}
    </div>
  );
}
