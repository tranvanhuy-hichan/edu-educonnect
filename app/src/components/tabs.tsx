"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * `right`: các nút thao tác (thêm mới, điều hướng ngày, lọc...) đặt CÙNG HÀNG với tab, sát bên phải; điện thoại thì xuống dòng riêng bên dưới.
 * Thanh tab. Ít tab (≤ 5): chia đều toàn chiều rộng trên điện thoại. Nhiều tab: cuộn ngang, mờ dần ở mép còn nội dung,
 * và tab đang chọn tự cuộn vào giữa để không bị cắt.
 */
export function Tabs({ items, current, right }: { items: [string, string][]; current: string; right?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const few = items.length <= 5;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.querySelector<HTMLElement>("[data-on]")?.scrollIntoView({ inline: "center", block: "nearest" });
    const update = () => setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [current, items.length]);

  return (
    <div className={`mb-4 ${right ? "sm:flex sm:items-stretch" : ""}`}>
      <div className={`relative min-w-0 ${right ? "sm:flex-1" : ""}`}>
        <div ref={box} className="flex gap-0.5 overflow-x-auto border-b sm:gap-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {items.map(([href, label]) => {
            const on = current === href;
            return (
              <Link key={href} href={href} scroll={false} {...(on ? { "data-on": "" } : {})}
                className={`-mb-px min-w-max shrink-0 whitespace-nowrap border-b-2 py-2.5 text-[13px] sm:px-3 sm:text-sm ${few ? "flex-1 px-3 text-center sm:flex-none" : "px-3"} ${on ? "border-orange-600 font-semibold text-orange-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {label}
              </Link>
            );
          })}
        </div>
        {edge.left && <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--bg)] to-transparent sm:hidden" />}
        {edge.right && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--bg)] to-transparent sm:hidden" />}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2 pt-2 sm:shrink-0 sm:flex-nowrap sm:justify-end sm:border-b sm:pl-3 sm:pt-0 max-sm:[&>*]:grow">{right}</div>}
    </div>
  );
}
