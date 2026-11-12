"use client";
import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { FileUploader } from "@/components/file-uploader";
import { MathText } from "@/components/math-text";
import { Field, inputCls } from "@/components/ui";
import type { Res } from "@/lib/action";

type Att = { url: string; name: string };
type Opt = { uid: string; content: string; isCorrect: boolean; images: Att[] };
export type QuestionDraft = {
  id?: string; type: string; subjectId: string; gradeLevelId: string; libraryLessonId: string; topic: string; difficulty: string; content: string; explanation: string;
  images: Att[]; options: Opt[]; mode: "NUMBER" | "TEXT"; answers: string; tolerance: string;
};

const IMG_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const IMG_HINT = "Ảnh PNG, JPG, WebP.";
const TYPES: [string, string, string][] = [
  ["SINGLE_CHOICE", "Trắc nghiệm 1 đáp án", "Học sinh chọn 1 trong các đáp án A, B, C, D"],
  ["TRUE_FALSE_GROUP", "Đúng/Sai", "Một câu dẫn và 4 ý a, b, c, d, học sinh chọn Đúng hoặc Sai cho từng ý"],
  ["SHORT_ANSWER", "Điền đáp án", "Học sinh gõ đáp án cuối cùng (số hoặc chữ)"],
];
// Chèn nhanh công thức; ‸ là vị trí con trỏ sau khi chèn.
const SNIPPETS: [string, string, string][] = [
  ["a/b", "$\\frac{‸}{}$", "Phân số"], ["√", "$\\sqrt{‸}$", "Căn bậc hai"], ["xⁿ", "$x^{‸}$", "Số mũ"], ["xₙ", "$x_{‸}$", "Chỉ số dưới"],
  ["v⃗", "$\\vec{‸}$", "Vectơ"], ["∫", "$\\int_{a}^{b} ‸ \\,dx$", "Tích phân"], ["Σ", "$\\sum_{i=1}^{n} ‸$", "Tổng"],
  ["α", "$\\alpha$", "alpha"], ["β", "$\\beta$", "beta"], ["Δ", "$\\Delta$", "Delta"], ["π", "$\\pi$", "pi"], ["λ", "$\\lambda$", "lambda"], ["ω", "$\\omega$", "omega"], ["Ω", "$\\Omega$", "Ohm"], ["μ", "$\\mu$", "mu"],
  ["°", "$^\\circ$", "Độ"], ["±", "$\\pm$", "Cộng trừ"], ["≠", "$\\neq$", "Khác"], ["≤", "$\\leq$", "Nhỏ hơn hoặc bằng"], ["≥", "$\\geq$", "Lớn hơn hoặc bằng"], ["≈", "$\\approx$", "Xấp xỉ"], ["→", "$\\rightarrow$", "Mũi tên"],
  ["H₂O", "$\\ce{‸}$", "Công thức hóa học, vd \\ce{H2SO4}, \\ce{2H2 + O2 -> 2H2O}"],
];

let seq = 0;
const uid = () => `n${Date.now().toString(36)}${seq++}`;
const blank = (n: number): Opt[] => Array.from({ length: n }, () => ({ uid: uid(), content: "", isCorrect: false, images: [] }));

export type LessonOption = { id: string; title: string; orderNo: number; subjectId: string; gradeLevelId: string };

export function QuestionEditor({ action, initial, subjects, grades, lessons, maxBytes, cancelHref, returnTo }: {
  action: (p: Res, fd: FormData) => Promise<Res>; initial: QuestionDraft; subjects: { id: string; name: string }[]; grades: { id: string; name: string }[]; lessons: LessonOption[]; maxBytes: number; cancelHref: string; returnTo?: string;
}) {
  const [subjectId, setSubjectId] = useState(initial.subjectId);
  const [gradeId, setGradeId] = useState(initial.gradeLevelId);
  const [lessonId, setLessonId] = useState(initial.libraryLessonId);
  const lessonChoices = lessons.filter((l) => l.subjectId === subjectId && l.gradeLevelId === gradeId);
  const [type, setType] = useState(initial.type);
  const [content, setContent] = useState(initial.content);
  const [explanation, setExplanation] = useState(initial.explanation);
  const [options, setOptions] = useState<Opt[]>(initial.options);
  const [mode, setMode] = useState(initial.mode);
  const last = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  function changeType(next: string) {
    setType(next);
    setOptions((cur) => {
      const want = next === "TRUE_FALSE_GROUP" ? 4 : next === "SINGLE_CHOICE" ? Math.max(cur.length, 4) : 0;
      const kept = cur.slice(0, want).map((o) => ({ ...o, isCorrect: next === "SINGLE_CHOICE" ? false : o.isCorrect }));
      return [...kept, ...blank(want - kept.length)];
    });
  }
  const patch = (id: string, p: Partial<Opt>) => setOptions((cur) => cur.map((o) => (o.uid === id ? { ...o, ...p } : o)));

  function insert(snippet: string) {
    const el = last.current;
    if (!el) return;
    const key = el.dataset.key ?? "";
    const caret = snippet.indexOf("‸");
    const text = snippet.replace("‸", "");
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    if (key === "content") setContent(next);
    else if (key === "explanation") setExplanation(next);
    else if (key.startsWith("opt:")) patch(key.slice(4), { content: next });
    const pos = start + (caret >= 0 ? caret : text.length);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  }
  const track = { onFocus: (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => { last.current = e.currentTarget; } };
  const tf = type === "TRUE_FALSE_GROUP";

  return (
    <ActionForm action={action} submit={initial.id ? "Lưu câu hỏi" : "Thêm câu hỏi"} reset={false} className="flex flex-col gap-5 [&>button]:self-start">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="type" value={type} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <input type="hidden" name="options" value={JSON.stringify(options.map(({ uid: u, content: c, isCorrect }) => ({ uid: u, content: c, isCorrect })))} />

      <div className="grid gap-3 sm:grid-cols-3">
        {TYPES.map(([v, label, hint]) => (
          <button key={v} type="button" onClick={() => changeType(v)} aria-pressed={type === v}
            className={`rounded-lg border p-3 text-left transition-colors ${type === v ? "border-orange-500 bg-orange-50 ring-1 ring-orange-500" : "bg-white hover:bg-slate-50"}`}>
            <div className="text-sm font-semibold">{label}</div>
            <div className="mt-0.5 text-xs font-normal text-slate-500">{hint}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Môn học">
          <select name="subjectId" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setLessonId(""); }} className={inputCls} required>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Khối (bắt buộc)">
          <select name="gradeLevelId" value={gradeId} onChange={(e) => { setGradeId(e.target.value); setLessonId(""); }} className={inputCls} required>
            <option value="">-- chọn khối --</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Bài học (tùy chọn)">
          <select name="libraryLessonId" value={lessonId} onChange={(e) => setLessonId(e.target.value)} className={inputCls} disabled={!gradeId}>
            <option value="">Chưa phân bài</option>
            {lessonChoices.map((l) => <option key={l.id} value={l.id}>Bài {l.orderNo}. {l.title}</option>)}
          </select>
        </Field>
        <Field label="Chương / bài (tùy chọn)"><input name="topic" defaultValue={initial.topic} maxLength={200} className={inputCls} placeholder="vd Chương 2 - Dao động" /></Field>
        <Field label="Độ khó">
          <select name="difficulty" defaultValue={initial.difficulty} className={inputCls}>
            <option value="EASY">Dễ</option><option value="MEDIUM">Trung bình</option><option value="HARD">Khó</option>
          </select>
        </Field>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-slate-600">Chèn nhanh công thức (bấm vào ô soạn thảo trước, rồi chọn)</div>
        <div className="flex flex-wrap gap-1">
          {SNIPPETS.map(([label, snippet, hint]) => (
            <button key={snippet} type="button" title={hint} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(snippet)}
              className="h-8 min-w-8 rounded-md border bg-white px-2 text-sm hover:bg-orange-50">{label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label={tf ? "Câu dẫn" : "Nội dung câu hỏi"}>
          <textarea name="content" rows={6} value={content} data-key="content" {...track} onChange={(e) => setContent(e.target.value)} className={inputCls + " h-auto w-full py-2 font-mono text-[13px]"} placeholder="Gõ nội dung. Công thức đặt trong $...$, vd $x^2 + 3x = 0$" />
        </Field>
        <div className="space-y-1 text-xs font-medium text-slate-600">
          <p>Xem trước</p>
          <div className="min-h-[9.5rem] rounded-md border bg-slate-50 p-3 text-sm font-normal text-slate-800">
            {content.trim() ? <MathText text={content} /> : <span className="text-slate-400">Nội dung câu hỏi sẽ hiện ở đây.</span>}
          </div>
        </div>
      </div>
      <div className="space-y-1 text-xs font-semibold"><p>Ảnh đính kèm câu hỏi (tùy chọn, hình vẽ, đồ thị, sơ đồ)</p>
        <FileUploader name="images" purpose="QUESTION" initialFiles={initial.images} maxBytes={maxBytes} accept={IMG_ACCEPT} hint={IMG_HINT} />
      </div>

      {type !== "SHORT_ANSWER" && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">{tf ? "4 ý a, b, c, d (chọn Đúng hoặc Sai cho từng ý)" : "Các đáp án (chọn đáp án đúng)"}</div>
          {options.map((o, i) => (
            <div key={o.uid} className="space-y-2 rounded-lg border bg-white p-3">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{(tf ? "abcdef" : "ABCDEF")[i]}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <input value={o.content} data-key={`opt:${o.uid}`} {...track} onChange={(e) => patch(o.uid, { content: e.target.value })} className={inputCls + " w-full"} placeholder={tf ? "Nội dung ý này" : "Nội dung đáp án"} />
                  {o.content.includes("$") && <div className="rounded bg-slate-50 px-2 py-1 text-sm"><MathText text={o.content} /></div>}
                </div>
                {tf ? (
                  <select value={o.isCorrect ? "T" : "F"} onChange={(e) => patch(o.uid, { isCorrect: e.target.value === "T" })} className={inputCls + " w-24 shrink-0"} aria-label={`Đáp án đúng của ý ${"abcd"[i]}`}>
                    <option value="T">Đúng</option><option value="F">Sai</option>
                  </select>
                ) : (
                  <label className="mt-1.5 flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-600">
                    <input type="radio" name="__correct" checked={o.isCorrect} onChange={() => setOptions((cur) => cur.map((x) => ({ ...x, isCorrect: x.uid === o.uid })))} />Đúng
                  </label>
                )}
                {!tf && options.length > 2 && (
                  <button type="button" aria-label="Xóa đáp án" onClick={() => setOptions((cur) => cur.filter((x) => x.uid !== o.uid))} className="mt-1 rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button>
                )}
              </div>
              <div className="pl-9 text-xs font-semibold">
                <FileUploader name={`opt_img_${o.uid}`} purpose="QUESTION" multiple={false} initialFiles={o.images} maxBytes={maxBytes} accept={IMG_ACCEPT} hint={`Ảnh cho ${tf ? "ý" : "đáp án"} này (tùy chọn). ${IMG_HINT}`} />
              </div>
            </div>
          ))}
          {!tf && options.length < 6 && (
            <button type="button" onClick={() => setOptions((cur) => [...cur, ...blank(1)])} className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:underline"><Plus className="size-4" />Thêm đáp án</button>
          )}
        </div>
      )}

      {type === "SHORT_ANSWER" && (
        <div className="space-y-3 rounded-lg border bg-white p-3">
          <div className="text-sm font-semibold">Đáp án đúng</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Kiểu đáp án">
              <select name="ansMode" value={mode} onChange={(e) => setMode(e.target.value as "NUMBER" | "TEXT")} className={inputCls}>
                <option value="NUMBER">Số (so sánh theo giá trị)</option><option value="TEXT">Chữ (bỏ qua hoa thường, khoảng trắng)</option>
              </select>
            </Field>
            {mode === "NUMBER" && <Field label="Sai số cho phép (±)"><input name="ansTol" defaultValue={initial.tolerance} inputMode="decimal" className={inputCls} placeholder="vd 0,01" /></Field>}
          </div>
          <Field label="Các đáp án chấp nhận (mỗi dòng một đáp án)">
            <textarea name="ansAnswers" rows={3} defaultValue={initial.answers} className={inputCls + " h-auto w-full py-2"} placeholder={mode === "NUMBER" ? "3,14" : "Hà Nội\nha noi"} />
          </Field>
          <p className="text-xs font-normal text-slate-500">{mode === "NUMBER" ? "Học sinh gõ 3,14 hoặc 3.14 đều được. Sai số cho phép: đáp án 3,14 với sai số 0,01 nhận mọi giá trị từ 3,13 đến 3,15." : "Hệ thống bỏ qua chữ hoa/thường, khoảng trắng thừa và dấu chấm cuối câu."}</p>
        </div>
      )}

      <Field label="Lời giải / giải thích (tùy chọn, hiện cùng đáp án đúng)">
        <textarea name="explanation" rows={3} value={explanation} data-key="explanation" {...track} onChange={(e) => setExplanation(e.target.value)} className={inputCls + " h-auto w-full py-2 font-mono text-[13px]"} />
      </Field>
      <div className="-mt-3"><a href={cancelHref} className="text-sm text-slate-500 hover:text-orange-700">Quay lại ngân hàng câu hỏi</a></div>
    </ActionForm>
  );
}
