"use client";
import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DEFAULT_POLICY, type Policy } from "@/lib/policy-schema";
import { inputCls } from "@/components/ui";
import { savePolicy } from "./policy-actions";

const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));
const NumIn = ({ value, onChange, step = 0.1, w = "w-20" }: { value: number; onChange: (n: number) => void; step?: number; w?: string }) => (
  <input type="number" step={step} min={0} value={value} onChange={(e) => onChange(num(e.target.value))} className={`${inputCls} ${w}`} />
);
const TxtIn = ({ value, onChange, w = "w-40", ...rest }: { value: string; onChange: (s: string) => void; w?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) => (
  <input value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${w}`} {...rest} />
);
const Sec = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <fieldset className="content-panel w-full space-y-3 rounded-lg border p-4"><legend className="px-2 text-sm font-semibold">{title}</legend>{hint && <p className="text-xs text-slate-500">{hint}</p>}{children}</fieldset>
);
const Del = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <button type="button" disabled={disabled} onClick={onClick} aria-label="Xóa dòng" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><Trash2 className="size-4" /></button>
);
const Add = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:underline"><Plus className="size-4" />{children}</button>
);

export function PolicyForm({ initial }: { initial: Policy }) {
  const [p, setP] = useState<Policy>(initial);
  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => setP((x) => ({ ...x, [k]: v }));
  const patch = <T,>(list: T[], i: number, part: Partial<T>) => list.map((x, at) => (at === i ? { ...x, ...part } : x));
  const levels = p.learning.levels, last = levels.length - 1;

  return (
    <ActionForm action={savePolicy} submit="Lưu quy chế" reset={false} className="flex w-full flex-col gap-4 [&>button]:self-start">
      <input type="hidden" name="policy" value={JSON.stringify(p)} />

      <Sec title="1. Thang xếp loại theo điểm trung bình" hint="Dùng ở bảng điểm, hồ sơ học sinh và thống kê lớp. Xếp từ mức cao nhất xuống thấp nhất; mức thấp nhất bắt đầu từ 0 điểm.">
        <div className="space-y-2">
          {p.gradeScale.map((g, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <TxtIn value={g.name} onChange={(name) => set("gradeScale", patch(p.gradeScale, i, { name }))} placeholder="Tên mức" />
              <span className="text-slate-500">từ</span>
              <NumIn value={g.min} onChange={(min) => set("gradeScale", patch(p.gradeScale, i, { min }))} />
              <span className="text-slate-500">điểm trở lên</span>
              <Del disabled={p.gradeScale.length <= 2} onClick={() => set("gradeScale", p.gradeScale.filter((_, at) => at !== i))} />
            </div>
          ))}
        </div>
        <Add onClick={() => set("gradeScale", [...p.gradeScale.slice(0, -1), { name: "Mức mới", min: 0.5 }, p.gradeScale[p.gradeScale.length - 1]])}>Thêm mức</Add>
      </Sec>

      <Sec title="2. Xếp loại học lực cả năm" hint="Xét từ mức tốt nhất xuống. Học sinh đạt mức đầu tiên thỏa MỌI điều kiện của mức đó. Mức cuối cùng là mức không đạt, không cần điều kiện. Nếu lớp có ít môn hơn con số yêu cầu thì hệ thống chỉ yêu cầu tối đa bằng số môn của lớp.">
        <div className="space-y-3">
          {levels.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
              <TxtIn value={l.name} onChange={(name) => set("learning", { ...p.learning, levels: patch(levels, i, { name }) })} placeholder="Tên mức" />
              {i === last ? <span className="text-slate-500">— mức không đạt (mặc định khi không thỏa các mức trên)</span> : <>
                <span className="text-slate-500">mọi môn từ</span><NumIn value={l.minEach} onChange={(minEach) => set("learning", { ...p.learning, levels: patch(levels, i, { minEach }) })} />
                <span className="text-slate-500">điểm, và ít nhất</span><NumIn step={1} w="w-16" value={l.highCount} onChange={(highCount) => set("learning", { ...p.learning, levels: patch(levels, i, { highCount }) })} />
                <span className="text-slate-500">môn từ</span><NumIn value={l.highScore} onChange={(highScore) => set("learning", { ...p.learning, levels: patch(levels, i, { highScore }) })} />
                <span className="text-slate-500">điểm; tối đa</span><NumIn step={1} w="w-16" value={l.maxFailedComments} onChange={(maxFailedComments) => set("learning", { ...p.learning, levels: patch(levels, i, { maxFailedComments }) })} />
                <span className="text-slate-500">môn nhận xét &ldquo;chưa đạt&rdquo;</span>
                <Del disabled={levels.length <= 2} onClick={() => set("learning", { ...p.learning, levels: levels.filter((_, at) => at !== i) })} />
              </>}
            </div>
          ))}
        </div>
        <Add onClick={() => set("learning", { ...p.learning, levels: [...levels.slice(0, -1), { name: "Mức mới", minEach: 5, highScore: 5, highCount: 1, maxFailedComments: 0 }, levels[last]] })}>Thêm mức học lực</Add>
      </Sec>

      <Sec title="3. Xếp loại rèn luyện" hint="Từ tốt nhất đến kém nhất. Mức cuối cùng là mức không đạt: học sinh bị mức này sẽ ở trạng thái cần đánh giá lại.">
        <div className="flex flex-wrap items-center gap-2">
          {p.learning.conductLevels.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <TxtIn w="w-32" value={c} onChange={(v) => set("learning", { ...p.learning, conductLevels: p.learning.conductLevels.map((x, at) => (at === i ? v : x)) })} />
              <Del disabled={p.learning.conductLevels.length <= 2} onClick={() => set("learning", { ...p.learning, conductLevels: p.learning.conductLevels.filter((_, at) => at !== i) })} />
            </span>
          ))}
        </div>
        <Add onClick={() => set("learning", { ...p.learning, conductLevels: [...p.learning.conductLevels.slice(0, -1), "Mức mới", p.learning.conductLevels[p.learning.conductLevels.length - 1]] })}>Thêm mức rèn luyện</Add>
      </Sec>

      <Sec title="4. Lên lớp và lớp học">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <label className="space-y-1"><span className="block text-xs font-semibold">Nghỉ tối đa cả năm (buổi)</span><NumIn step={1} w="w-full" value={p.promotion.maxAbsenceDays} onChange={(maxAbsenceDays) => set("promotion", { ...p.promotion, maxAbsenceDays })} /><span className="block text-xs text-slate-500">Vượt quá thì đề xuất ở lại lớp</span></label>
          <label className="space-y-1"><span className="block text-xs font-semibold">Sĩ số tối đa của lớp</span><NumIn step={1} w="w-full" value={p.promotion.classCapacity} onChange={(classCapacity) => set("promotion", { ...p.promotion, classCapacity })} /></label>
          <label className="space-y-1"><span className="block text-xs font-semibold">Điểm TB &ldquo;cần quan tâm&rdquo; dưới</span><NumIn w="w-full" value={p.promotion.attentionBelow} onChange={(attentionBelow) => set("promotion", { ...p.promotion, attentionBelow })} /><span className="block text-xs text-slate-500">Hiện cảnh báo ở danh sách học sinh</span></label>
        </div>
      </Sec>

      {([["roomTypes", "5. Loại phòng học"], ["examCategories", "6. Loại kỳ thi"]] as const).map(([key, title]) => (
        <Sec key={key} title={title} hint="Mã chỉ gồm chữ HOA, số và gạch dưới (không đổi được sau khi đã dùng). Không xóa được mục đang có dữ liệu sử dụng.">
          <div className="space-y-2">
            {p[key].map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <TxtIn w="w-44" value={c.code} placeholder="MA_LOAI" onChange={(code) => set(key, patch(p[key], i, { code: code.toUpperCase().replace(/[^A-Z0-9_]/g, "") }))} />
                <TxtIn w="w-56" value={c.label} placeholder="Tên hiển thị" onChange={(label) => set(key, patch(p[key], i, { label }))} />
                <Del disabled={p[key].length <= 1} onClick={() => set(key, p[key].filter((_, at) => at !== i))} />
              </div>
            ))}
          </div>
          <Add onClick={() => set(key, [...p[key], { code: "MA_MOI", label: "Mục mới" }])}>Thêm mục</Add>
        </Sec>
      ))}

      <Sec title="7. Xếp loại tiết học (sổ đầu bài)" hint="Giáo viên chọn mức này khi ghi sổ đầu bài. Mỗi mức gồm ký hiệu (A, B, C…) và chữ đi kèm; xếp từ tốt nhất đến kém nhất (màu hiển thị theo thứ tự). Mã dùng để lưu dữ liệu, không đổi được sau khi đã có sổ sử dụng.">
        <div className="space-y-2">
          {p.diaryRatings.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <TxtIn w="w-16" value={r.symbol} placeholder="A" maxLength={3} onChange={(symbol) => set("diaryRatings", patch(p.diaryRatings, i, { symbol }))} />
              <TxtIn w="w-48" value={r.label} placeholder="Chữ đi kèm (vd Tốt)" onChange={(label) => set("diaryRatings", patch(p.diaryRatings, i, { label }))} />
              <TxtIn w="w-36" value={r.code} placeholder="MA" onChange={(code) => set("diaryRatings", patch(p.diaryRatings, i, { code: code.toUpperCase().replace(/[^A-Z0-9_]/g, "") }))} />
              <Del disabled={p.diaryRatings.length <= 2} onClick={() => set("diaryRatings", p.diaryRatings.filter((_, at) => at !== i))} />
            </div>
          ))}
        </div>
        <Add onClick={() => set("diaryRatings", [...p.diaryRatings, { code: "MA_MOI", symbol: "E", label: "Mức mới" }])}>Thêm mức</Add>
      </Sec>

      <Sec title="8. Thư viện">
        <label className="space-y-1 text-sm"><span className="block text-xs font-semibold">Số sách tối đa mỗi học sinh được mượn cùng lúc</span><NumIn step={1} w="w-28" value={p.library.maxBooksPerStudent} onChange={(maxBooksPerStudent) => set("library", { maxBooksPerStudent })} /></label>
      </Sec>

      <button type="button" onClick={() => { if (confirm("Khôi phục toàn bộ quy chế về mặc định? (chưa lưu cho đến khi bấm Lưu quy chế)")) setP(DEFAULT_POLICY); }} className="inline-flex items-center gap-1 self-start text-sm text-slate-600 hover:underline"><RotateCcw className="size-4" />Khôi phục mặc định</button>
    </ActionForm>
  );
}
