"use client";

import { useState } from "react";
import { KeyRound, Loader2, X, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { parentChangePassword } from "./actions";

export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setOk("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await parentChangePassword(fd);
      setBusy(false);
      if (res.success) {
        setOk(res.message ?? "Đổi mật khẩu thành công!");
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setErr(res.error ?? "Đổi mật khẩu không thành công.");
      }
    } catch {
      setBusy(false);
      setErr("Đã có lỗi xảy ra. Vui lòng thử lại.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-2xl text-[var(--fg)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Đổi mật khẩu cá nhân</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bảo vệ thông tin sổ liên lạc điện tử của con bạn
            </p>
          </div>
        </div>

        {ok ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-5 shrink-0" />
            <span>{ok}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mật khẩu hiện tại
              </label>
              <div className="relative mt-1">
                <input
                  name="oldPassword"
                  type={showOld ? "text" : "password"}
                  required
                  placeholder="Mật khẩu hiện tại (mặc định: 123456)"
                  className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] pl-3 pr-10 text-sm text-[var(--fg)] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
                />
                <button
                  type="button"
                  onClick={() => setShowOld((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showOld ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mật khẩu mới
              </label>
              <div className="relative mt-1">
                <input
                  name="newPassword"
                  type={showNew ? "text" : "password"}
                  required
                  minLength={6}
                  placeholder="Tối thiểu 6 ký tự"
                  className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] pl-3 pr-10 text-sm text-[var(--fg)] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Xác nhận mật khẩu mới
              </label>
              <div className="relative mt-1">
                <input
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Nhập lại mật khẩu mới"
                  className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 text-sm text-[var(--fg)] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25"
                />
              </div>
            </div>

            {err && (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-lg border border-[var(--line)] px-4 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-coral-600 hover:bg-coral-700 px-4 text-xs font-semibold text-white shadow-sm transition disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  "Lưu mật khẩu mới"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
