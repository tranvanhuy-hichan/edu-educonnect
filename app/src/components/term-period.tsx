"use client";
import { useState } from "react";
import { Field, inputCls } from "@/components/ui";

const DAY = 86400_000;
const parse = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00Z") : null);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const endOf = (start: string, weeks: number) => { const s = parse(start); return s && weeks >= 1 ? iso(new Date(s.getTime() + (weeks * 7 - 1) * DAY)) : ""; };
const weeksOf = (start: string, end: string) => { const s = parse(start), e = parse(end); return s && e && e >= s ? Math.ceil(((e.getTime() - s.getTime()) / DAY + 1) / 7) : 0; };
const fmt = (s: string) => { const d = parse(s); return d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : ""; };

/**
 * Một khoảng thời gian học kỳ: ngày bắt đầu + số tuần → ngày kết thúc dự kiến (= bắt đầu + tuần×7 − 1).
 * Ô ngày kết thúc sửa tay được; sửa tay thì số tuần được suy ngược từ hai ngày, đổi lại ngày bắt đầu/số tuần thì tính lại.
 * Gửi lên server: `${prefix}Start`, `${prefix}Weeks`, `${prefix}End`.
 */
export function PeriodInput({ prefix, label, defaultStart = "", defaultEnd = "", defaultWeeks = 18, onChange }: { prefix: string; label: string; defaultStart?: string; defaultEnd?: string; defaultWeeks?: number; onChange?: (v: { start: string; end: string }) => void }) {
  const initWeeks = defaultStart && defaultEnd ? weeksOf(defaultStart, defaultEnd) || defaultWeeks : defaultWeeks;
  const [start, setStart] = useState(defaultStart);
  const [weeks, setWeeks] = useState(String(initWeeks));
  const [end, setEnd] = useState(defaultEnd || endOf(defaultStart, initWeeks));
  const [manual, setManual] = useState(!!defaultEnd && defaultEnd !== endOf(defaultStart, initWeeks));
  const set = (s: string, e: string) => { setEnd(e); onChange?.({ start: s, end: e }); };
  const derived = weeksOf(start, end);
  const bad = end && start && !derived;
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-semibold">{label}</legend>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ngày bắt đầu"><input type="date" name={`${prefix}Start`} value={start} required className={inputCls + " w-full"} onChange={(e) => { setStart(e.target.value); setManual(false); set(e.target.value, endOf(e.target.value, Number(weeks))); }} /></Field>
        <Field label="Số tuần"><input type="number" name={`${prefix}Weeks`} min={1} max={30} value={weeks} required className={inputCls + " w-full"} onChange={(e) => { setWeeks(e.target.value); setManual(false); set(start, endOf(start, Number(e.target.value))); }} /></Field>
      </div>
      <Field label={manual ? "Ngày kết thúc (đã sửa tay)" : "Ngày kết thúc dự kiến (sửa được)"}>
        <input type="date" name={`${prefix}End`} value={end} required className={inputCls + " w-full"} onChange={(e) => { setEnd(e.target.value); setManual(true); const w = weeksOf(start, e.target.value); if (w) setWeeks(String(w)); onChange?.({ start, end: e.target.value }); }} />
      </Field>
      <p className={`text-xs ${bad ? "text-red-600" : "text-slate-500"}`}>{bad ? "Ngày kết thúc phải sau ngày bắt đầu." : start && end ? `${fmt(start)} → ${fmt(end)} · ${derived} tuần` : "Nhập ngày bắt đầu và số tuần để xem ngày kết thúc dự kiến."}</p>
    </fieldset>
  );
}

/** Các ô của form "Thêm năm học": tên (tự gợi ý theo ngày bắt đầu HK1), HK1 và HK2; ngày đầu/cuối cả năm lấy từ HK1 và HK2. */
export function NewYearFields() {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const suggest = (start: string) => { if (!touched && /^\d{4}/.test(start)) setName(`${start.slice(0, 4)}-${Number(start.slice(0, 4)) + 1}`); };
  return (
    <>
      <PeriodInput prefix="hk1" label="Học kỳ 1" onChange={(v) => suggest(v.start)} />
      <PeriodInput prefix="hk2" label="Học kỳ 2" />
      <Field label="Tên năm học"><input name="yearName" value={name} onChange={(e) => { setName(e.target.value); setTouched(true); }} className={inputCls + " w-full"} placeholder="vd: 2027-2028" required /></Field>
      <p className="text-xs text-slate-500">Năm học bắt đầu từ ngày bắt đầu HK1 và kết thúc cùng HK2. Tuần 1 của Sổ đầu bài tính từ tuần chứa ngày bắt đầu HK1; sang năm học mới, số tuần đếm lại từ đầu.</p>
    </>
  );
}

/** Form sửa/thêm một học kỳ: dùng chung khung ngày bắt đầu + số tuần + ngày kết thúc dự kiến. */
export function TermDatesFields({ defaultStart, defaultEnd }: { defaultStart?: string; defaultEnd?: string }) {
  return <PeriodInput prefix="term" label="Thời gian học kỳ" defaultStart={defaultStart} defaultEnd={defaultEnd} />;
}
