"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, LogOut, Phone, User, Users } from "lucide-react";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { ChangePasswordModal } from "./change-password-modal";
import { parentLogout } from "./actions";

export type ChildSummary = {
  id: string;
  fullName: string;
  code: string | null;
  className: string;
};

export function ParentHeader({
  brandName,
  brandLogo,
  parentPhone,
  parentName,
  childrenList,
  selectedChildId,
}: {
  brandName: string;
  brandLogo: string | null;
  parentPhone: string;
  parentName: string | null;
  childrenList: ChildSummary[];
  selectedChildId: string;
}) {
  const [openModal, setOpenModal] = useState(false);

  return (
    <>
      <header className="no-print border-b border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {brandLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo} alt="" className="size-10 rounded-full object-cover ring-1 ring-orange-500/20" />
            ) : (
              <div className="grid size-10 place-items-center rounded-full bg-orange-600 font-bold text-white shadow-sm">
                {brandName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-bold text-base leading-tight text-[var(--fg)]">{brandName}</div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                Sổ liên lạc điện tử Phụ huynh
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-[var(--bg)] px-3 py-1.5 rounded-full border border-[var(--line)]">
              <Phone className="size-3.5 text-orange-600 dark:text-orange-400" />
              <span>SĐT: <strong className="font-semibold">{parentPhone}</strong></span>
              {parentName && <span className="text-slate-400">({parentName})</span>}
            </div>

            <button
              onClick={() => setOpenModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-xs"
              title="Đổi mật khẩu cá nhân"
            >
              <KeyRound className="size-3.5 text-orange-600 dark:text-orange-400" />
              <span className="hidden sm:inline">Đổi mật khẩu</span>
            </button>

            <form action={parentLogout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition shadow-xs"
                title="Đăng xuất khỏi Cổng phụ huynh"
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </form>

            <ModeToggle />
          </div>
        </div>

        {/* Children Switcher Bar if multiple children exist */}
        {childrenList.length > 1 && (
          <div className="border-t border-[var(--line)] bg-[var(--bg)] px-4 py-2 sm:px-6">
            <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto">
              <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                <Users className="size-3.5" /> Con của bạn:
              </span>
              <div className="flex items-center gap-2">
                {childrenList.map((c) => {
                  const active = c.id === selectedChildId;
                  return (
                    <Link
                      key={c.id}
                      href={`/phu-huynh?child=${c.id}`}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition whitespace-nowrap ${
                        active
                          ? "bg-orange-600 text-white shadow-xs"
                          : "border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] hover:bg-orange-50 dark:hover:bg-orange-950/30"
                      }`}
                    >
                      <User className="size-3" />
                      <span>{c.fullName}</span>
                      <span className={`text-[11px] rounded-full px-1.5 py-0.2 ${
                        active ? "bg-orange-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}>
                        {c.className}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>

      <ChangePasswordModal open={openModal} onClose={() => setOpenModal(false)} />
    </>
  );
}
