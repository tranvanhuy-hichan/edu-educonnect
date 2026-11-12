"use client";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Lỗi bất ngờ trong một trang: hiện thông báo và nút thử lại, thanh menu vẫn dùng được (không trắng màn hình). */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <div className="mx-auto mt-10 max-w-md space-y-4 rounded-xl border bg-white p-6 text-center">
      <h2 className="text-lg font-semibold">Trang gặp sự cố</h2>
      <p className="text-sm text-slate-600">Hệ thống chưa tải được trang này. Hãy thử lại. Nếu vẫn lỗi, báo quản trị viên kèm mã dưới đây.</p>
      {error.digest && <p className="font-mono text-xs text-slate-400">Mã lỗi: {error.digest}</p>}
      <div className="flex justify-center gap-2">
        <button type="button" onClick={reset} className="h-9 rounded-md bg-coral-600 px-4 text-sm font-medium text-white hover:bg-coral-700">Thử lại</button>
        <Link href="/" className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-slate-50">Về trang chủ</Link>
      </div>
    </div>
  );
}
