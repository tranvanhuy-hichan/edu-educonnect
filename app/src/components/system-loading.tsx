"use client";
import { usePathname } from "next/navigation";
import { SystemTabs } from "@/components/system-tabs";
import { HeadSkeleton, ToolbarSkeleton, TableSkeleton } from "@/components/skeleton";

const PATHS = ["/van-hanh", "/nhat-ky", "/thung-rac", "/ket-noi-api"] as const;

/** Khung chờ của mục Vận hành hệ thống: giữ thanh tab (cùng vị trí với trang thật) để chuyển giữa 4 trang không bị nháy. */
export function SystemLoading() {
  const path = usePathname().replace(/\/$/, "");
  const current = PATHS.find((p) => p === path);
  return <div>{current && <SystemTabs current={current} />}<HeadSkeleton action={false} /><ToolbarSkeleton /><TableSkeleton rows={10} cols={5} /></div>;
}
