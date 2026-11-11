"use client";
import { useMemo, useState } from "react";
import { Search, UserCheck } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { inputCls } from "@/components/ui";
import { normalizeText } from "@/components/searchable-select";
import { ratingTone, type DiaryRating } from "@/lib/policy-schema";
import { saveLog } from "../actions";

export type RosterStudent = { id: string; name: string; code: string; status: "" | "EXCUSED" | "UNEXCUSED" };
type Status = RosterStudent["status"];
const OPTIONS: [Status, string, string, string][] = [["", "Có mặt", "Có", "bg-green-600 text-white"], ["EXCUSED", "Có phép", "Phép", "bg-amber-500 text-white"], ["UNEXCUSED", "Không phép", "Không", "bg-red-600 text-white"]];
const ROW_TINT: Record<Status, string> = { "": "", EXCUSED: "bg-amber-500/10", UNEXCUSED: "bg-red-500/10" };

const Block = ({ title, hint, aside, children }: { title: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode }) => (
  <section className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 className="text-sm font-semibold">{title}</h2>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>{aside}
    </div>
    {children}
  </section>
);

export function DiaryForm({ slotId, date, roster, ratings, initial }: { slotId: string; date: string; roster: RosterStudent[]; ratings: DiaryRating[]; initial: { lessonTitle: string; rating: string; note: string; absent: number } }) {
  const [status, setStatus] = useState<Record<string, Status>>(() => Object.fromEntries(roster.map((s) => [s.id, s.status])));
  const [rating, setRating] = useState(initial.rating);
  const [q, setQ] = useState("");
  const list = useMemo(() => { const k = normalizeText(q.trim()); return k ? roster.filter((s) => normalizeText(`${s.name} ${s.code}`).includes(k)) : roster; }, [q, roster]);
  const excused = roster.filter((s) => status[s.id] === "EXCUSED").length, unexcused = roster.filter((s) => status[s.id] === "UNEXCUSED").length, absent = excused + unexcused;

  return (
    <ActionForm action={saveLog} submit="Lưu sổ đầu bài" reset={false} className="flex flex-col gap-7 md:[&>button]:sticky md:[&>button]:bottom-3 [&>button]:z-10 [&>button]:w-full sm:[&>button]:w-auto [&>button]:self-start [&>button]:justify-center md:[&>button]:shadow-lg">
      <input type="hidden" name="slotId" value={slotId} /><input type="hidden" name="date" value={date} />

      <Block title="Nội dung tiết học">
        <div className="grid gap-3">
          <label className="block space-y-1 text-xs font-medium text-slate-500">Tên bài / nội dung bài dạy
            <textarea name="lessonTitle" defaultValue={initial.lessonTitle} rows={2} placeholder="vd: Bài 3 – Hàm số bậc hai" maxLength={1000} className={inputCls + " h-auto w-full py-2 text-sm font-normal text-inherit"} />
          </label>
          <label className="block space-y-1 text-xs font-medium text-slate-500">Nhận xét
            <textarea name="note" defaultValue={initial.note} rows={3} placeholder="Tình hình lớp, việc dặn dò…" className={inputCls + " h-auto w-full py-2 text-sm font-normal text-inherit"} />
          </label>
        </div>
      </Block>

      <Block title="Xếp loại tiết học" hint="Bấm lần nữa để bỏ chọn" aside={<span className="text-xs text-slate-500">{rating ? `Đã chọn: ${ratings.find((r) => r.code === rating)?.symbol ?? rating}` : "Chưa xếp loại"}</span>}>
        <input type="hidden" name="conductRating" value={rating} />
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Xếp loại tiết học">
          {ratings.map((r) => {
            const on = rating === r.code;
            return (
              <button key={r.code} type="button" role="radio" aria-checked={on} onClick={() => setRating(on ? "" : r.code)}
                className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-1 py-2.5 transition sm:gap-1 sm:px-3 sm:py-3 ${on ? `${ratingTone(ratings, r.code)} border-current shadow-sm` : "border-slate-200 opacity-80 hover:opacity-100"}`}>
                <span className="text-xl font-bold leading-none sm:text-2xl">{r.symbol}</span>
                <span className="text-[11px] font-medium leading-tight sm:text-xs">{r.label}</span>
              </button>
            );
          })}
        </div>
      </Block>

      <Block title="Điểm danh" aside={<span className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
        <span className="rounded-full bg-green-600/15 px-2.5 py-1 font-medium text-green-700">Có mặt {roster.length - absent}</span>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-medium text-amber-700">Có phép {excused}</span>
        <span className="rounded-full bg-red-600/15 px-2.5 py-1 font-medium text-red-700">Không phép {unexcused}</span>
      </span>}>
        {roster.length === 0 ? (
          <label className="block space-y-1 text-xs font-medium text-slate-500">Số học sinh vắng<input type="number" name="absent" min={0} defaultValue={initial.absent} className={inputCls + " w-32 font-normal"} /></label>
        ) : <>
          <input type="hidden" name="roster" value="1" />
          {roster.map((s) => <input key={s.id} type="hidden" name={`abs_${s.id}`} value={status[s.id]} />)}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm học sinh theo tên hoặc mã…" className={inputCls + " h-10 w-full pl-9"} /></div>
            <button type="button" onClick={() => setStatus(Object.fromEntries(roster.map((s) => [s.id, ""])))} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border px-3 text-sm hover:bg-slate-500/10 sm:w-auto"><UserCheck className="size-4 text-green-600" />Có mặt tất cả</button>
          </div>
          <ul className="max-h-[28rem] divide-y divide-slate-500/20 overflow-y-auto rounded-lg border">
            {list.map((s) => (
              <li key={s.id} className={`flex items-center justify-between gap-2 px-3 py-2 sm:gap-x-4 sm:py-2.5 ${ROW_TINT[status[s.id]]}`}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="hidden size-8 shrink-0 place-items-center rounded-full bg-orange-500/15 text-xs font-bold text-orange-700 sm:grid">{s.name.split(" ").pop()?.[0]}</span>
                  <div className="min-w-0"><div className="truncate text-sm font-medium">{s.name}</div><div className="text-xs text-slate-500">{s.code}</div></div>
                </div>
                <div className="inline-grid shrink-0 grid-cols-3 overflow-hidden rounded-lg border text-center text-xs sm:text-sm" role="group" aria-label={`Điểm danh ${s.name}`}>
                  {OPTIONS.map(([value, label, short, on]) => (
                    <button key={value || "present"} type="button" aria-pressed={status[s.id] === value} onClick={() => setStatus((p) => ({ ...p, [s.id]: value }))} className={`whitespace-nowrap px-2 py-1.5 transition sm:px-3 ${status[s.id] === value ? on : "text-slate-500 hover:bg-slate-500/10"}`}><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></button>
                  ))}
                </div>
              </li>
            ))}
            {!list.length && <li className="px-3 py-6 text-center text-sm text-slate-500">Không tìm thấy học sinh.</li>}
          </ul>
        </>}
      </Block>
    </ActionForm>
  );
}
