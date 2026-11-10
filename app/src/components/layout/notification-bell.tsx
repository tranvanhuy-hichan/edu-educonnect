"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BookMarked,
  BookOpen,
  Calendar,
  CheckCheck,
  GraduationCap,
} from "lucide-react";

type NotificationItem = {
  id: string;
  title: string;
  content: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    const loadData = () => {
      fetch("/api/notifications", { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          if (controller.signal.aborted) return;
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
          setNow(Date.now());
        })
        .catch(() => { /* Giữ dữ liệu hiện tại khi mất mạng hoặc unmount. */ });
    };
    loadData();
    const interval = setInterval(loadData, 45000); // Polling mỗi 45 giây
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markAllRead() {
    setLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_all" }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  async function handleClickItem(item: NotificationItem) {
    if (!item.isRead) {
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      }).catch(() => null);

      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }

  function getIcon(type: string) {
    switch (type) {
      case "ASSIGNMENT":
        return <BookOpen className="size-4 text-orange-600" />;
      case "EXAM":
        return <GraduationCap className="size-4 text-indigo-600" />;
      case "SCHEDULE":
        return <Calendar className="size-4 text-blue-600" />;
      case "LIBRARY":
        return <BookMarked className="size-4 text-emerald-600" />;
      default:
        return <Bell className="size-4 text-slate-500" />;
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Math.max(0, Math.floor((now - new Date(dateStr).getTime()) / 1000));
    if (diff < 60) return "Vừa xong";
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return `${Math.floor(diff / 86400)} ngày trước`;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 hover:bg-slate-100"
        aria-label="Thông báo"
        title="Thông báo"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 text-sm">Thông báo</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">
                  {unreadCount} mới
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={loading}
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" /> Đã đọc tất cả
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                <Bell className="mx-auto mb-2 size-6 text-slate-300" />
                Không có thông báo nào.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleClickItem(item)}
                  className={`flex cursor-pointer items-start gap-3 p-3 text-left transition hover:bg-slate-50 ${
                    !item.isRead ? "bg-orange-50/40" : ""
                  }`}
                >
                  <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-white border border-slate-100 shadow-xs">
                    {getIcon(item.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <h4
                        className={`text-xs font-semibold truncate ${
                          !item.isRead ? "text-slate-900" : "text-slate-700"
                        }`}
                      >
                        {item.title}
                      </h4>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">
                      {item.content}
                    </p>
                  </div>
                  {!item.isRead && (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-orange-600" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
