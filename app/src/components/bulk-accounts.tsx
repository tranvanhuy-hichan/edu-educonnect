import { ActionForm } from "@/components/action-form";
import type { Res } from "@/lib/action";

export function BulkAccounts({ action, children }: { action: (state: Res, fd: FormData) => Promise<Res>; children?: React.ReactNode }) {
  return <ActionForm action={action} submit="Nhập danh sách & tải CSV" reset={false} className="flex flex-col gap-3">
    <p className="text-sm text-slate-600">Mỗi dòng một họ tên, tối đa 200 người. Hệ thống tự tạo tài khoản và mật khẩu ban đầu riêng cho từng người. File CSV tự tải sau khi nhập xong.</p>
    <label className="text-sm">Danh sách họ tên<textarea name="list" required rows={8} maxLength={30000} placeholder={"Nguyễn Văn An\nTrần Thị Bình"} className="mt-1 w-full rounded-md border bg-white p-3" /></label>
    {children}
  </ActionForm>;
}
