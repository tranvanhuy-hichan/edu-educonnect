"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/** Trạng thái tối/sáng nằm ở thuộc tính data-dark của <html>; đọc qua useSyncExternalStore để không phải setState trong effect. */
const subscribe = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-dark"] });
  return () => observer.disconnect();
};

export function ModeToggle() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.dataset.dark === "1", () => false);
  function toggle() {
    const next = !dark;
    document.documentElement.dataset.dark = next ? "1" : "0";
    document.cookie = `mode=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <button onClick={toggle} className="rounded-md p-2 hover:bg-slate-100" aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"} title={dark ? "Chế độ sáng" : "Chế độ tối"}>
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
