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
      <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-white px-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {brandLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandLogo} alt="" className="size-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-600 font-bold text-white">{brandName.slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">{brandName}</div>
            <div className="truncate text-[11px] text-slate-500">Sổ liên lạc điện tử · Phụ huynh</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span className="hidden items-center gap-1.5 text-sm text-slate-500 md:inline-flex"><Phone className="size-3.5" />{parentPhone}{parentName ? ` · ${parentName}` : ""}</span>
          <button onClick={() => setOpenModal(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm hover:bg-slate-100" title="Đổi mật khẩu cá nhân" aria-label="Đổi mật khẩu">
            <KeyRound className="size-4" /><span className="hidden sm:inline">Đổi mật khẩu</span>
          </button>
          <form action={parentLogout}>
            <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm text-red-700 hover:bg-red-50" title="Đăng xuất" aria-label="Đăng xuất">
              <LogOut className="size-4" /><span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </form>
          <ModeToggle />
        </div>
      </header>

      <ChangePasswordModal open={openModal} onClose={() => setOpenModal(false)} />
    </>
  );
}
