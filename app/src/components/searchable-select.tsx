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

/** Chuẩn hóa để tìm không dấu, không phân biệt hoa thường ("le van cuong" khớp "Lê Văn Cường"). */
export const normalizeText = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

/**
 * Ô chọn có tìm kiếm, dùng như <select> trong form:
 * - gửi giá trị qua một input ẩn `name`; khi đổi giá trị bắn sự kiện `input` (bubbles) để AutoForm tự áp dụng bộ lọc;
 * - chỉ khi truyền `minSearchable` (mặc định 0 = luôn có ô tìm kiếm) thì danh sách ngắn mới dùng <select> gốc;
 * - `emptyLabel`/`allowEmpty`: thêm lựa chọn rỗng (vd. "Tất cả lớp").
 */
export function SearchableSelect({
  name,
  options,
  placeholder = "-- Chọn --",
  defaultValue = "",
  required = false,
  className = "",
  emptyLabel,
  allowEmpty,
  minSearchable = 0,
  searchPlaceholder = "Gõ để tìm kiếm...",
  ariaLabel,
  value: controlledValue,
  onChange,
}: {
  name: string;
  options: SelectOption[];
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  minSearchable?: number;
  searchPlaceholder?: string;
  ariaLabel?: string;
  /** Dùng cho form controlled: truyền `value` + `onChange` (không truyền thì tự quản lý bằng defaultValue). */
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [inner, setSelected] = useState(defaultValue);
  const selected = controlledValue ?? inner;
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId();
  const withEmpty = allowEmpty ?? emptyLabel !== undefined;

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
    if (open) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [open]);

  // Lưu ý: bộ lọc đổi giá trị từ bên ngoài thì truyền `key={giá trị}` để remount (như với <select> thường).

  const filtered = useMemo(() => {
    const q = normalizeText(search.trim());
    const rows = q
      ? options.filter((o) => normalizeText(`${o.label} ${o.subtext ?? ""} ${o.badge ?? ""}`).includes(q))
      : options;
    return !q && withEmpty ? [{ value: "", label: emptyLabel ?? placeholder } as SelectOption, ...rows] : rows;
  }, [options, search, withEmpty, emptyLabel, placeholder]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const currentOption = options.find((o) => o.value === selected);

  // Giá trị controlled đổi từ bên ngoài → đồng bộ input ẩn (không bắn sự kiện).
  useEffect(() => {
    const el = hiddenRef.current;
    if (controlledValue !== undefined && el && el.value !== controlledValue) el.value = controlledValue;
  }, [controlledValue]);

  function choose(value: string) {
    setSelected(value);
    onChange?.(value);
    setOpen(false);
    setSearch("");
    const el = hiddenRef.current;
    if (el && el.value !== value) {
      // Đặt giá trị bằng setter gốc để React nhận ra thay đổi, rồi bắn `input` cho AutoForm.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) choose(filtered[active].value); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); setSearch(""); }
  }

  // Danh sách ngắn: dùng <select> gốc (hành vi như cũ, kể cả `required`).
  if (options.length <= minSearchable) {
    return (
      <select name={name} defaultValue={defaultValue} required={required} aria-label={ariaLabel} className={`${inputCls} ${className}`}>
        <option value="">{emptyLabel ?? placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}{o.subtext ? ` (${o.subtext})` : ""}</option>)}
      </select>
    );
  }

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {/* Input ẩn gửi giá trị qua FormData (type=text + hidden để React phát được onChange cho form) */}
      <input ref={hiddenRef} type="text" hidden name={name} defaultValue={defaultValue} readOnly tabIndex={-1} />

      {open ? (
        // Đang mở: chính ô chọn trở thành ô nhập để gõ tìm kiếm (không có ô tìm kiếm riêng bên dưới)
        <div className={`${inputCls} relative flex w-full items-center gap-2 border-orange-500 ring-1 ring-orange-500`}>
          <Search className="size-3.5 shrink-0 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={`${uniqueId}-list`}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder={currentOption ? currentOption.label : (withEmpty && emptyLabel) || searchPlaceholder}
            autoComplete="off"
            className="combo-input min-w-0 flex-1 text-base placeholder:text-slate-700 md:text-sm"
          />
          {search && <button type="button" onClick={() => { setSearch(""); searchInputRef.current?.focus(); }} className="text-slate-400 hover:text-slate-600" aria-label="Xóa từ khóa"><X className="size-3.5" /></button>}
          <button type="button" tabIndex={-1} aria-label="Đóng" onClick={() => { setOpen(false); setSearch(""); }}><ChevronDown className="size-4 shrink-0 rotate-180 text-slate-400" /></button>
        </div>
      ) : (
      <button
        type="button"
        id={uniqueId}
        aria-haspopup="listbox"
        aria-expanded={false}
        aria-label={ariaLabel}
        onClick={() => { setActive(0); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActive(0); setOpen(true); } }}
        className={`${inputCls} flex w-full items-center justify-between gap-2 text-left focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500`}
      >
        <span className={`truncate ${!currentOption ? "text-slate-400" : "text-slate-800"}`}>
          {currentOption ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="font-medium">{currentOption.label}</span>
              {currentOption.subtext && <span className="truncate text-xs text-slate-500">({currentOption.subtext})</span>}
            </span>
          ) : (
            (withEmpty && emptyLabel) || placeholder
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>
      )}

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full min-w-60 max-w-[calc(100vw-2rem)] rounded-md border bg-white p-1.5 shadow-lg">
          <div ref={listRef} id={`${uniqueId}-list`} role="listbox" className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-slate-500">Không tìm thấy kết quả phù hợp</div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === selected;
                return (
                  <button
                    key={opt.value || "__empty"}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose(opt.value)}
                    className={`flex w-full items-center justify-between rounded px-3 py-2.5 text-left text-sm transition-colors ${
                      idx === active ? "bg-orange-100" : "hover:bg-orange-50"
                    } ${isSelected ? "font-medium text-orange-800" : "text-slate-700"}`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className={`truncate text-sm ${opt.value ? "font-medium" : "text-slate-500"}`}>{opt.label}</div>
                      {opt.subtext && <div className="truncate text-xs text-slate-500">{opt.subtext}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {opt.badge && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{opt.badge}</span>}
                      {isSelected && <Check className="size-4 text-orange-600" />}
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
    const q = normalizeText(search.trim());
    return availableOptions.filter((o) => normalizeText(`${o.label} ${o.subtext ?? ""} ${o.badge ?? ""}`).includes(q));
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
