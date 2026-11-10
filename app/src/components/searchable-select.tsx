"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { inputCls } from "@/components/ui";

export type SelectOption = {
  value: string;
  label: string;
  subtext?: string;
  badge?: string;
};

export function SearchableSelect({
  name,
  options,
  placeholder = "-- Chọn --",
  defaultValue = "",
  required = false,
  className = "",
}: {
  name: string;
  options: SelectOption[];
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(defaultValue);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const uniqueId = useId();

  // Đóng khi click ngoài
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtext && o.subtext.toLowerCase().includes(q)) ||
        (o.badge && o.badge.toLowerCase().includes(q)),
    );
  }, [options, search]);

  const currentOption = options.find((o) => o.value === selected);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Hidden input gửi giá trị qua FormData */}
      <input type="hidden" name={name} value={selected} required={required} />

      <button
        type="button"
        id={uniqueId}
        onClick={() => setOpen((prev) => !prev)}
        className={`${inputCls} flex w-full items-center justify-between gap-2 text-left focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500`}
      >
        <span className={`truncate ${!currentOption ? "text-slate-400" : "text-slate-800"}`}>
          {currentOption ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="font-medium">{currentOption.label}</span>
              {currentOption.subtext && (
                <span className="text-xs text-slate-500 truncate">({currentOption.subtext})</span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className={`size-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full rounded-md border bg-white p-1 shadow-lg">
          <div className="relative border-b pb-1">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Gõ để tìm kiếm..."
              className="h-8 w-full rounded bg-slate-50 pl-8 pr-7 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-orange-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto pt-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-slate-500">
                Không tìm thấy kết quả phù hợp
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === selected;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setSelected(opt.value);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-orange-50 ${
                      isSelected ? "bg-orange-50 font-medium text-orange-800" : "text-slate-700"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate font-medium">{opt.label}</div>
                      {opt.subtext && (
                        <div className="truncate text-[11px] text-slate-500">{opt.subtext}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {opt.badge && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <Check className="size-3.5 text-orange-600" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function MultiSearchableSelect({
  name,
  options,
  placeholder = "Gõ tên hoặc mã sách để thêm vào phiếu...",
  defaultValues = [],
  required = false,
  className = "",
}: {
  name: string;
  options: SelectOption[];
  placeholder?: string;
  defaultValues?: string[];
  required?: boolean;
  className?: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultValues);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedMap = useMemo(() => new Set(selectedIds), [selectedIds]);

  const availableOptions = useMemo(() => {
    return options.filter((o) => !selectedMap.has(o.value));
  }, [options, selectedMap]);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableOptions;
    const q = search.toLowerCase();
    return availableOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtext && o.subtext.toLowerCase().includes(q)) ||
        (o.badge && o.badge.toLowerCase().includes(q)),
    );
  }, [availableOptions, search]);

  const selectedList = useMemo(() => {
    return selectedIds
      .map((id) => options.find((o) => o.value === id))
      .filter((o): o is SelectOption => Boolean(o));
  }, [selectedIds, options]);

  function handleAdd(value: string) {
    if (!selectedMap.has(value)) {
      setSelectedIds((prev) => [...prev, value]);
    }
    setSearch("");
    // Giữ focus trên ô search để người dùng có thể gõ chọn tiếp quyển khác
    searchInputRef.current?.focus();
  }

  function handleRemove(value: string) {
    setSelectedIds((prev) => prev.filter((id) => id !== value));
  }

  return (
    <div ref={containerRef} className={`space-y-2 ${className}`}>
      {/* Hidden inputs cho server action */}
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {required && selectedIds.length === 0 && (
        <input type="hidden" name={`${name}_required_check`} required />
      )}

      {/* Hộp tìm kiếm và chọn sách */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`${inputCls} w-full pl-9 pr-8 text-xs focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {open && (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-white p-1 shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-slate-500">
                {availableOptions.length === 0
                  ? "Đã chọn hết tất cả sách sẵn sàng"
                  : "Không tìm thấy sách phù hợp"}
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleAdd(opt.value)}
                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-orange-50"
                >
                  <div className="min-w-0 pr-2">
                    <div className="truncate font-medium text-slate-800">{opt.label}</div>
                    {opt.subtext && (
                      <div className="truncate text-[11px] text-slate-500">{opt.subtext}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {opt.badge && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                        {opt.badge}
                      </span>
                    )}
                    <span className="rounded bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                      + Chọn
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Danh sách các cuốn sách đã được chọn vào phiếu */}
      <div className="rounded-md border bg-slate-50 p-2.5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            Sách trong phiếu ({selectedList.length} cuốn):
          </span>
          {selectedList.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-[11px] text-red-600 hover:underline"
            >
              Xóa tất cả
            </button>
          )}
        </div>

        {selectedList.length === 0 ? (
          <p className="py-2 text-center text-xs italic text-slate-400">
            Chưa có cuốn sách nào được chọn vào phiếu. Vui lòng tìm kiếm sách ở trên để thêm.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {selectedList.map((item, idx) => (
              <div
                key={item.value}
                className="flex items-center justify-between rounded border bg-white px-2.5 py-1.5 text-xs shadow-sm"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700">
                      {idx + 1}
                    </span>
                    <span className="truncate font-medium text-slate-800">{item.label}</span>
                  </div>
                  {item.badge && (
                    <div className="ml-5 font-mono text-[11px] text-slate-500">
                      Mã: {item.badge} {item.subtext ? `· ${item.subtext}` : ""}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(item.value)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Bỏ chọn"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
