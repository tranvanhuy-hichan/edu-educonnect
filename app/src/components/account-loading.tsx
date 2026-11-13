"use client";
import { usePathname } from "next/navigation";
import { AccountTabs } from "@/components/account-tabs";
import { HeadSkeleton, ToolbarSkeleton, TableSkeleton } from "@/components/skeleton";
import { Title } from "@/components/ui";

const TAB_PATHS = ["/tai-khoan", "/tai-khoan/nhan-su", "/tai-khoan/bao-mat"];

/**
 * Khung chờ của khu Tài khoản: giữ nguyên tiêu đề và thanh tab (giống trang thật) để chuyển tab không bị nháy,
 * chỉ phần nội dung bên dưới hiện khung chờ. Các trang khác trong khu này (chi tiết, rà soát) dùng khung chờ chung.
 */
export function AccountLoading() {
  const path = usePathname().replace(/\/$/, "");
  if (!TAB_PATHS.includes(path)) return <div><HeadSkeleton /><ToolbarSkeleton /><TableSkeleton rows={10} cols={5} /></div>;
  return <div className="space-y-4"><Title>Tài khoản & Nhân sự</Title><AccountTabs current={path} /><ToolbarSkeleton /><TableSkeleton rows={10} cols={5} /></div>;
}
