"use client";
import { useActionState, useEffect, useRef } from "react";
import { useDialogClose } from "@/components/dialog";
import { downloadCredentials } from "@/lib/credentials-csv";
import type { Res } from "@/lib/action";
import { confirmAction, toast } from "@/lib/feedback";

export function ActionForm({
  action,
  children,
  submit = "Lưu",
  className = "grid w-full grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  reset = true,
  danger = false,
  compact = false,
  ghost = false,
  block = false,
  confirmText,
}: {
  action: (p: Res, fd: FormData) => Promise<Res>;
  children?: React.ReactNode;
  submit?: React.ReactNode;
  className?: string;
  reset?: boolean;
  danger?: boolean;
  compact?: boolean;
  ghost?: boolean;
  /** Nút viền, cao 36px, rộng hết ô chứa — dùng cho cụm nút hành động trên điện thoại. */
  block?: boolean;
  confirmText?: string;
}) {
  // Thông báo phát ngay khi kết quả về từ máy chủ (không đợi hiệu ứng của React): sau khi xoá/thu hồi, trang vẽ lại và chính
  // biểu mẫu này biến mất, nếu để hiệu ứng phát thì thông báo không bao giờ hiện.
  const notify = async (prev: Res, fd: FormData): Promise<Res> => {
    const r = await action(prev, fd);
    if (r?.error) toast.error(r.error);
    else if (r?.ok && !/mật khẩu/i.test(r.ok)) toast.success(r.ok);
    return r;
  };
  const [res, fn, pending] = useActionState(notify, null);
  const ref = useRef<HTMLFormElement>(null);
  const closeDialog = useDialogClose();
  const downloaded = useRef<Res>(null);
  const confirmed = useRef(false);
  // Thông báo có mật khẩu giữ trên trang vì chỉ hiện một lần và không được tự tắt (các kết quả khác hiện bằng toast, xem notify bên dưới).
  const sensitive = !!res?.ok && /mật khẩu/i.test(res.ok);
  useEffect(() => {
    if (!res?.data?.credentials || downloaded.current === res) return;
    downloaded.current = res;
    downloadCredentials(JSON.parse(res.data.credentials));
  }, [res]);
  // Trong hộp thoại: lưu xong thì tự đóng, trừ khi thông báo có mật khẩu cần người dùng đọc.
  useEffect(() => {
    if (closeDialog && res?.ok && !/mật khẩu/i.test(res.ok)) { const t = setTimeout(closeDialog, 600); return () => clearTimeout(t); }
  }, [res, closeDialog]);
  return (
    <form
      ref={ref}
      action={async (fd) => {
        fn(fd);
        if (reset) setTimeout(() => ref.current?.reset(), 50);
      }}
      onSubmit={(e) => {
        // Hộp xác nhận riêng (không dùng confirm của trình duyệt): chặn gửi, hỏi, đồng ý thì gửi lại một lần.
        if (!confirmText || confirmed.current) { confirmed.current = false; return; }
        e.preventDefault();
        void confirmAction({ title: danger ? "Bạn chắc chắn chứ?" : "Xác nhận thao tác", message: confirmText, tone: danger ? "danger" : "default", confirmLabel: typeof submit === "string" ? submit : undefined }).then((ok) => {
          if (ok) { confirmed.current = true; ref.current?.requestSubmit(); }
        });
      }}
      className={className}
    >
      {children}
      {closeDialog ? (
        // Trong hộp thoại: nút lưu + thông báo nằm trên thanh cố định ở đáy, luôn thấy được dù form dài
        <div className="sticky bottom-0 z-10 col-span-full -mx-5 -mb-4 mt-2 flex flex-wrap items-center gap-3 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6" style={{ background: "var(--surface)" }}>
          <div className="min-w-0 flex-1 text-sm empty:hidden">
            {sensitive && <span className="block whitespace-pre-line text-green-700">{res!.ok}</span>}
            {res?.data?.credentials && <button type="button" onClick={() => downloadCredentials(JSON.parse(res.data!.credentials))} className="block text-orange-700 underline">Tải lại CSV tài khoản và mật khẩu ban đầu</button>}
          </div>
          <button disabled={pending} className={`h-10 whitespace-nowrap rounded-md px-5 text-sm font-medium transition-colors disabled:opacity-50 max-sm:w-full ${danger ? "bg-red-700 text-white hover:bg-red-800" : ghost ? "text-orange-700 hover:bg-orange-50" : "bg-coral-600 text-white hover:bg-coral-700"}`}>{pending ? "..." : submit}</button>
        </div>
      ) : (<>
      <button
        disabled={pending}
        className={block
          ? `h-9 w-full whitespace-nowrap rounded-md border bg-white px-2 text-sm font-medium transition-colors disabled:opacity-50 ${danger ? "border-red-300 text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"}`
          : `${compact ? "h-9 px-3 text-sm sm:h-7 sm:px-2 sm:text-xs" : "h-9 px-4 text-sm"} justify-self-start whitespace-nowrap rounded-md font-medium transition-colors disabled:opacity-50 ${
          ghost ? (danger ? "text-red-600 hover:bg-red-50" : "text-orange-700 hover:bg-orange-50")
            // nút nhỏ trong dòng/bảng: viền nhẹ thay vì khối màu đặc để danh sách không bị "đỏ rực"
            : compact ? (danger ? "border border-red-300 bg-white text-red-600 hover:bg-red-50" : "border bg-white text-orange-700 hover:bg-orange-50")
            : `text-white ${danger ? "bg-red-700 hover:bg-red-800" : "bg-coral-600 hover:bg-coral-700"}`
        }`}>
        {pending ? "..." : submit}
      </button>
      {res?.data?.credentials && <button type="button" onClick={() => downloadCredentials(JSON.parse(res.data!.credentials))} className="col-span-full text-sm text-orange-700 underline">Tải lại CSV tài khoản và mật khẩu ban đầu</button>}
      {sensitive && <span className="col-span-full w-full whitespace-pre-line text-sm text-green-700">{res!.ok}</span>}
      </>)}
    </form>
  );
}
