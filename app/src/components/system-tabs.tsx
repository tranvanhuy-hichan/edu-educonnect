import Link from "next/link";
import { Activity, FileClock, Plug, Trash2 } from "lucide-react";

const TABS = [
  { href: "/van-hanh", label: "Vận hành", icon: Activity },
  { href: "/nhat-ky", label: "Nhật ký hoạt động", icon: FileClock },
  { href: "/thung-rac", label: "Thùng rác", icon: Trash2 },
  { href: "/ket-noi-api", label: "Kết nối API", icon: Plug },
] as const;

/** Thanh tab chung của mục “Vận hành hệ thống” (một mục trên menu, bốn trang bên trong). Đặt ở đầu mỗi trang con. */
export function SystemTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Vận hành hệ thống" className="mb-4 flex gap-1 overflow-x-auto border-b">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === current;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${active ? "border-orange-600 text-orange-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"}`}>
            <Icon className="size-4" />{label}
          </Link>
        );
      })}
    </nav>
  );
}
