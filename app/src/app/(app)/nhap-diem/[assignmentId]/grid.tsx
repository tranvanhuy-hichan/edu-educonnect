"use client";
import { useActionState, useMemo, useState } from "react";
import { saveScores } from "../actions";

type Stu = { id: string; name: string; code: string };
type Weights = { tx: number; gk: number; ck: number };

const BANDS = [[9, "Xuất sắc"], [8, "Giỏi"], [6.5, "Khá"], [5, "Trung bình"], [0, "Yếu"]] as const;
const rankOf = (n: number | null) => (n == null ? "" : BANDS.find(([m]) => n >= m)![1]);

export function GradeGrid({ assignmentId, txCols, weights, students, initial }: { assignmentId: string; txCols: number; weights: Weights; students: Stu[]; initial: Record<string, number> }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
  const [res, action, pending] = useActionState(saveScores, null);
  const parse = (s: string | undefined) => { if (s == null || s.trim() === "") return undefined; const n = parseFloat(s.replace(",", ".")); return Number.isFinite(n) ? n : undefined; };
  const cols = useMemo(() => [
    ...Array.from({ length: txCols }, (_, i) => ({ key: `tx${i}`, name: `TX ${i + 1}`, note: `hs ${weights.tx}` })),
    { key: "gk", name: "Giữa kỳ", note: `hs ${weights.gk}` },
    { key: "ck", name: "Cuối kỳ", note: `hs ${weights.ck}` },
  ], [txCols, weights]);

  const totalOf = (sid: string) => {
    let sum = 0, w = 0;
    for (let i = 0; i < txCols; i++) { const v = parse(vals[`${sid}|tx${i}`]); if (v != null) { sum += v * weights.tx; w += weights.tx; } }
    const gk = parse(vals[`${sid}|gk`]), ck = parse(vals[`${sid}|ck`]);
    if (gk != null) { sum += gk * weights.gk; w += weights.gk; }
    if (ck != null) { sum += ck * weights.ck; w += weights.ck; }
    return w > 0 ? Math.round((sum / w) * 100) / 100 : null;
  };
  const rows = useMemo(() => students.map((s) => { const total = totalOf(s.id); return { s, total, rank: rankOf(total) }; }), [vals, students]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = () => {
    const out: { studentId: string; tx: number[]; gk: number | null; ck: number | null }[] = [];
    for (const s of students) {
      const diff = cols.some((c) => parse(vals[`${s.id}|${c.key}`]) !== initial[`${s.id}|${c.key}`]);
      if (!diff) continue;
      const tx: number[] = [];
      for (let i = 0; i < txCols; i++) { const v = parse(vals[`${s.id}|tx${i}`]); if (v != null) tx.push(v); }
      out.push({ studentId: s.id, tx, gk: parse(vals[`${s.id}|gk`]) ?? null, ck: parse(vals[`${s.id}|ck`]) ?? null });
    }
    return out;
  };
  const dirty = changed().length;
  const colAvg = (key: string) => {
    const a = students.map((s) => parse(vals[`${s.id}|${key}`])).filter((x): x is number => x != null);
    return a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : "-";
  };
  const totals = rows.map((r) => r.total).filter((x): x is number => x != null);
  const classAvg = totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2) : "-";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="rows" value={JSON.stringify(changed())} />
      <div className="max-h-[calc(100vh-13rem)] overflow-auto rounded-xl border bg-white">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="text-left">
            <tr>
              <th className="sticky left-0 top-0 z-30 w-12 min-w-12 border-b bg-orange-50 px-3 py-2">#</th><th className="sticky left-12 top-0 z-30 w-64 min-w-64 border-b border-r bg-orange-50 px-3 py-2">Học sinh</th>
              {cols.map((c) => <th key={c.key} className="sticky top-0 z-20 min-w-24 border-b bg-orange-50 px-2 py-2 text-center">{c.name}<div className="text-[10px] font-normal text-gray-500">/10 · {c.note}</div></th>)}
              <th className="sticky right-28 top-0 z-30 w-20 min-w-20 border-b border-l bg-orange-50 px-3 py-2 text-center">Điểm TB</th><th className="sticky right-0 top-0 z-30 w-28 min-w-28 border-b bg-orange-50 px-3 py-2">Xếp loại</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, total, rank }, ri) => (
              <tr key={s.id} className="[&>td]:border-b">
                <td className="sticky left-0 z-10 w-12 min-w-12 bg-white px-3 py-1 text-gray-500">{ri + 1}</td>
                <td className="sticky left-12 z-10 w-64 min-w-64 whitespace-nowrap border-r bg-white px-3 py-1">{s.name} <span className="text-xs text-gray-500">{s.code}</span></td>
                {cols.map((c, ci) => {
                  const k = `${s.id}|${c.key}`;
                  const n = parse(vals[k]);
                  const bad = n != null && (n < 0 || n > 10);
                  return (
                    <td key={c.key} className="px-1 py-1 text-center">
                      <input
                        data-r={ri} data-c={ci} value={vals[k] ?? ""} inputMode="decimal"
                        onChange={(e) => setVals((p) => ({ ...p, [k]: e.target.value }))}
                        onKeyDown={(e) => {
                          const mv = e.key === "Enter" || e.key === "ArrowDown" ? [1, 0] : e.key === "ArrowUp" ? [-1, 0] : null;
                          if (!mv) return;
                          e.preventDefault();
                          (document.querySelector(`[data-r="${ri + mv[0]}"][data-c="${ci}"]`) as HTMLInputElement | null)?.focus();
                        }}
                        className={`w-16 text-center border rounded-lg px-1 py-1 bg-white ${bad ? "border-red-500 bg-red-50" : ""}`}
                      />
                    </td>
                  );
                })}
                <td className="sticky right-28 z-10 w-20 min-w-20 border-l bg-white px-3 py-1 text-center font-bold text-orange-700">{total ?? "-"}</td>
                <td className="sticky right-0 z-10 w-28 min-w-28 bg-white px-3 py-1">{rank}</td>
              </tr>
            ))}
            <tr className="text-center text-xs">
              <td colSpan={2} className="sticky left-0 z-10 border-r bg-orange-50 px-3 py-2 text-left font-medium">Trung bình lớp</td>
              {cols.map((c) => <td key={c.key} className="bg-orange-50">{colAvg(c.key)}</td>)}
              <td className="sticky right-28 z-10 border-l bg-orange-50 font-bold">{classAvg}</td><td className="sticky right-0 z-10 bg-orange-50" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 items-center flex-wrap">
        <button disabled={pending || !dirty} className="bg-orange-600 text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50">{pending ? "Đang lưu..." : `Lưu điểm${dirty ? ` (${dirty} học sinh thay đổi)` : ""}`}</button>
        {res?.ok && <span className="text-green-700 text-sm">{res.ok}</span>}
        {res?.error && <span className="text-red-600 text-sm">{res.error}</span>}
        <span className="text-xs text-gray-500">Enter / ↓ để xuống dòng. Xoá ô để bỏ điểm.</span>
      </div>
    </form>
  );
}
