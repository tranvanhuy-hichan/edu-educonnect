"use client";
import { useRouter } from "next/navigation";

export function PageSizeSelect({ size, options }: { size: number; options: { value: number; href: string }[] }) {
  const router = useRouter();
  return <label className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-500">
    Mỗi trang
    <select aria-label="Số bản ghi mỗi trang" value={size} onChange={(event) => {
      const option = options.find((item) => item.value === Number(event.target.value));
      if (option) router.push(option.href, { scroll: false });
    }} className="h-9 rounded-md border bg-white px-2 text-sm text-slate-700">
      {options.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
    </select>
  </label>;
}
