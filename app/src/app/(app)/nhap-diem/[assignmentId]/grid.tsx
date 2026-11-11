"use client";
import { useActionState, useMemo, useState } from "react";
import { saveScores } from "../actions";
import { AlertTriangle } from "lucide-react";

type Stu = { id: string; name: string; code: string };
type Weights = { tx: number; gk: number; ck: number };

type Band = { name: string; min: number };
const bandOf = (bands: Band[], n: number | null) => (n == null ? "" : (bands.find((b) => n >= b.min) ?? bands[bands.length - 1]).name);

export function GradeGrid({
  assignmentId,
  exemptStudentIds = [],
  txCols,
  weights,
  bands,
  students,
  initial,
  readOnly = false,
  isLocked = false,
  termName,
  isManualLocked = false,
  lockedBy,
}: {
  assignmentId: string;
  exemptStudentIds?: string[];
  txCols: number;
  weights: Weights;
  bands: Band[]; // thang xếp loại trong Cấu hình → Quy chế
  students: Stu[];
  initial: Record<string, number>;
  readOnly?: boolean;
  isLocked?: boolean;
  isManager?: boolean;
  termId?: string;
  termName?: string;
  isManualLocked?: boolean;
  lockedBy?: string | null;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
  const [res, action, pending] = useActionState(saveScores, null);

  const parse = (s: string | undefined) => { if (s == null || s.trim() === "") return undefined; const n = parseFloat(s.replace(",", ".")); return Number.isFinite(n) ? n : undefined; };
  const cols = useMemo(() => [
    ...Array.from({ length: txCols }, (_, i) => ({ key: `tx${i}`, name: `TX ${i + 1}`, note: `hs ${weights.tx}` })),
    { key: "gk", name: "Giữa kỳ", note: `hs ${weights.gk}` },
    { key: "ck", name: "Cuối kỳ", note: `hs ${weights.ck}` },
  ], [txCols, weights]);

  const totalOf = (sid: string) => {
    if (exemptStudentIds.includes(sid)) return null;
    let sum = 0, w = 0;
    for (let i = 0; i < txCols; i++) { const v = parse(vals[`${sid}|tx${i}`]); if (v != null) { sum += v * weights.tx; w += weights.tx; } }
    const gk = parse(vals[`${sid}|gk`]), ck = parse(vals[`${sid}|ck`]);
    if (gk != null) { sum += gk * weights.gk; w += weights.gk; }
    if (ck != null) { sum += ck * weights.ck; w += weights.ck; }
    return w > 0 ? Math.round((sum / w) * 10) / 10 : null;
  };
  const rows = useMemo(() => students.map((s) => { const total = totalOf(s.id); return { s, total, rank: bandOf(bands, total) }; }), [vals, students]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = () => {
    const out: { studentId: string; tx: number[]; gk: number | null; ck: number | null }[] = [];
    for (const s of students) {
      if (exemptStudentIds.includes(s.id)) continue;
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
    <div className="space-y-3">
      {/* Khóa sổ điểm thông báo */}
      {isLocked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0 text-amber-600" />
            <div>
              <span className="font-semibold">Sổ điểm học kỳ {termName} đang bị khóa:</span>{" "}
              {isManualLocked ? `Đã khóa thủ công bởi BGH${lockedBy ? ` (${lockedBy})` : ""}.` : "Đã tự động khóa do học kỳ kết thúc quá 15 ngày."}{" "}
              {readOnly ? "Bạn chỉ có quyền xem điểm, không thể chỉnh sửa." : "Bạn có quyền sửa tạm thời đã được phê duyệt."}
            </div>
          </div>

        </div>
      )}


      <form action={action} className="space-y-3">
        <input type="hidden" name="assignmentId" value={assignmentId} />
        {!readOnly && <label className="block text-xs font-medium">Lý do cập nhật điểm<input required minLength={5} name="reason" className="ml-2 h-9 rounded-md border bg-white px-3 text-sm" placeholder="Nhập mới / sửa theo biên bản…" /></label>}
        <input type="hidden" name="rows" value={JSON.stringify(changed())} />
        <div className="content-panel max-h-[calc(100vh-13rem)] overflow-auto rounded-xl border bg-white">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead className="text-left">
              <tr>
                <th className="sticky left-0 top-0 z-30 w-12 min-w-12 border-b bg-orange-50 px-3 py-2">#</th>
                <th className="sticky left-12 top-0 z-30 w-64 min-w-64 border-b border-r bg-orange-50 px-3 py-2">Học sinh</th>
                {cols.map((c) => (
                  <th key={c.key} className="sticky top-0 z-20 min-w-24 border-b bg-orange-50 px-2 py-2 text-center">
                    {c.name}<div className="text-[10px] font-normal text-gray-500">/10 · {c.note}</div>
                  </th>
                ))}
                <th className="sticky right-28 top-0 z-30 w-20 min-w-20 border-b border-l bg-orange-50 px-3 py-2 text-center">Điểm TB</th>
                <th className="sticky right-0 top-0 z-30 w-28 min-w-28 border-b bg-orange-50 px-3 py-2">Xếp loại</th>
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
                          data-r={ri}
                          data-c={ci}
                          value={vals[k] ?? ""}
                          readOnly={readOnly}
                          disabled={readOnly || exemptStudentIds.includes(s.id)}
                          inputMode="decimal"
                          onChange={(e) => setVals((p) => ({ ...p, [k]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (readOnly) return;
                            const mv = e.key === "Enter" || e.key === "ArrowDown" ? [1, 0] : e.key === "ArrowUp" ? [-1, 0] : null;
                            if (!mv) return;
                            e.preventDefault();
                            (document.querySelector(`[data-r="${ri + mv[0]}"][data-c="${ci}"]`) as HTMLInputElement | null)?.focus();
                          }}
                          className={`w-16 text-center border rounded-lg px-1 py-1 ${readOnly ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200" : `bg-white ${bad ? "border-red-500 bg-red-50" : ""}`}`}
                        />
                      </td>
                    );
                  })}
                  <td className="sticky right-28 z-10 w-20 min-w-20 border-l bg-white px-3 py-1 text-center font-bold text-orange-700">{total ?? "-"}</td>
                  <td className="sticky right-0 z-10 w-28 min-w-28 bg-white px-3 py-1">{exemptStudentIds.includes(s.id) ? "Miễn đánh giá" : rank}</td>
                </tr>
              ))}
              <tr className="text-center text-xs">
                <td colSpan={2} className="sticky left-0 z-10 border-r bg-orange-50 px-3 py-2 text-left font-medium">Trung bình lớp</td>
                {cols.map((c) => <td key={c.key} className="bg-orange-50">{colAvg(c.key)}</td>)}
                <td className="sticky right-28 z-10 border-l bg-orange-50 font-bold">{classAvg}</td>
                <td className="sticky right-0 z-10 bg-orange-50" />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          {!readOnly && (
            <button
              type="submit"
              disabled={pending || !dirty}
              className="bg-orange-600 text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Đang lưu..." : `Lưu điểm${dirty ? ` (${dirty} học sinh thay đổi)` : ""}`}
            </button>
          )}
          {res?.ok && <span className="text-green-700 text-sm">{res.ok}</span>}
          {res?.error && <span className="text-red-600 text-sm">{res.error}</span>}
          {!readOnly && <span className="text-xs text-gray-500">Enter / ↓ để xuống dòng. Xoá ô để bỏ điểm.</span>}
        </div>
      </form>
    </div>
  );
}
