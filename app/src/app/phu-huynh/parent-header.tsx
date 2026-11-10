"use client";

import { useState } from "react";
import { KeyRound, LogOut, Phone } from "lucide-react";
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
}: {
  brandName: string;
  brandLogo: string | null;
  parentPhone: string;
  parentName: string | null;
  childrenList?: ChildSummary[];
  selectedChildId?: string;
}) {
  const [openModal, setOpenModal] = useState(false);

  return (
    <>
      <header className="no-print border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {brandLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo} alt="" className="size-10 rounded-full object-cover ring-2 ring-orange-500/20 shadow-xs" />
            ) : (
              <div className="grid size-10 place-items-center rounded-full bg-orange-600 font-bold text-white shadow-xs">
                {brandName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-bold text-base leading-tight text-slate-900 dark:text-slate-100">{brandName}</div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                Sổ liên lạc điện tử Phụ huynh
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
              <Phone className="size-3.5 text-orange-600 dark:text-orange-400" />
              <span>SĐT: <strong className="font-semibold text-slate-900 dark:text-slate-100">{parentPhone}</strong></span>
              {parentName && <span className="text-slate-500 dark:text-slate-400">({parentName})</span>}
            </div>

            <button
              onClick={() => setOpenModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition shadow-xs"
              title="Đổi mật khẩu cá nhân"
            >
              <KeyRound className="size-3.5 text-orange-600 dark:text-orange-400" />
              <span className="hidden sm:inline">Đổi mật khẩu</span>
            </button>

            <form action={parentLogout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition shadow-xs"
                title="Đăng xuất khỏi Cổng phụ huynh"
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </form>

            <ModeToggle />
          </div>
        </div>
      </header>

      <ChangePasswordModal open={openModal} onClose={() => setOpenModal(false)} />
    </>
  );
}
