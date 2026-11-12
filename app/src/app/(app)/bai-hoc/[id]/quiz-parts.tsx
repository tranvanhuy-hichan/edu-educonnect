import Link from "next/link";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { MathText } from "@/components/math-text";
import { inputCls } from "@/components/ui";
import { DIFFICULTY_LABEL, TYPE_LABEL, readAnswerKey } from "@/modules/question/question.grading";
import { addQuizQuestions, moveQuizQuestion, removeQuizQuestion, setQuizPoints } from "../actions";

type Opt = { id: string; label: string; content: string; images: unknown; isCorrect: boolean };
export type QuizQ = { id: string; type: string; content: string; images: unknown; explanation: string | null; answerKey: unknown; difficulty: string; topic: string | null; options: Opt[] };
export type QuizItem = { id: string; order: number; points: number; question: QuizQ };
export type StoredAnswer = { questionId: string; answer: unknown; score: number; maxScore: number; isCorrect: boolean };

export const fmtPts = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const urls = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

function Imgs({ list }: { list: unknown }) {
  const u = urls(list);
  if (!u.length) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-2">
      {u.map((src) => (
        <a key={src} href={src} target="_blank" rel="noopener noreferrer" title="Bấm để xem ảnh lớn">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Hình minh họa của câu hỏi" loading="lazy" className="max-h-60 max-w-full rounded-md border bg-white object-contain" />
        </a>
      ))}
    </span>
  );
}

const typeBadge = (t: string) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{TYPE_LABEL[t] ?? t}</span>;

function Stem({ index, q, points, extra }: { index: number; q: QuizQ; points: number; extra?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <b className="text-sm text-slate-900">Câu {index + 1}</b><span>({fmtPts(points)} điểm)</span>{typeBadge(q.type)}{extra}
      </div>
      <div className="text-sm text-slate-900"><MathText text={q.content} /></div>
      <Imgs list={q.images} />
    </div>
  );
}

/** Học sinh làm bài: chỉ dùng các ô nhập HTML thuần, không gửi đáp án đúng xuống trình duyệt. */
export function QuizTake({ items }: { items: QuizItem[] }) {
  return (
    <div className="space-y-4">
      {items.map(({ id, points, question: q }, i) => (
        <div key={id} className="space-y-3 rounded-lg border bg-white p-4">
          <Stem index={i} q={q} points={points} />
          {q.type === "SINGLE_CHOICE" && (
            <div className="space-y-2">
              {q.options.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm hover:bg-slate-50 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
                  <input type="radio" name={`a_${q.id}`} value={o.id} className="mt-1" />
                  <span className="min-w-0"><b>{o.label}.</b> <MathText text={o.content} /><Imgs list={o.images} /></span>
                </label>
              ))}
            </div>
          )}
          {q.type === "TRUE_FALSE_GROUP" && (
            <div className="space-y-2">
              {q.options.map((o) => (
                <div key={o.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2.5 text-sm">
                  <span className="min-w-0 flex-1"><b>{o.label})</b> <MathText text={o.content} /><Imgs list={o.images} /></span>
                  <span className="flex shrink-0 gap-2">
                    {([["T", "Đúng"], ["F", "Sai"]] as const).map(([v, l]) => (
                      <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
                        <input type="radio" name={`tf__${q.id}__${o.id}`} value={v} />{l}
                      </label>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
          {q.type === "SHORT_ANSWER" && (
            <div className="space-y-1">
              <input name={`a_${q.id}`} autoComplete="off" inputMode={readAnswerKey(q.answerKey).mode === "NUMBER" ? "decimal" : "text"} className={inputCls + " w-full max-w-sm"} placeholder="Nhập đáp án của em" />
              {readAnswerKey(q.answerKey).mode === "NUMBER" && <p className="text-xs text-slate-500">Nhập một số, có thể dùng dấu phẩy hoặc dấu chấm (vd 3,14).</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Xem lại bài đã làm. `reveal`: hiện đáp án đúng + lời giải (theo cài đặt của giáo viên; giáo viên luôn xem được). */
export function QuizReview({ items, answers, reveal }: { items: QuizItem[]; answers: StoredAnswer[]; reveal: boolean }) {
  const byQ = new Map(answers.map((a) => [a.questionId, a]));
  return (
    <div className="space-y-4">
      {items.map(({ id, points, question: q }, i) => {
        const a = byQ.get(q.id);
        const given = (a?.answer && typeof a.answer === "object" ? a.answer : {}) as { optionId?: string; text?: string; picks?: Record<string, boolean> };
        const score = a?.score ?? 0, max = a?.maxScore ?? points;
        const tone = score >= max && max > 0 ? "bg-green-100 text-green-800" : score > 0 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-700";
        const key = readAnswerKey(q.answerKey);
        return (
          <div key={id} className="space-y-3 rounded-lg border bg-white p-4">
            <Stem index={i} q={q} points={max} extra={<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{fmtPts(score)}/{fmtPts(max)} điểm</span>} />
            {q.type === "SINGLE_CHOICE" && (
              <div className="space-y-2">
                {q.options.map((o) => {
                  const picked = given.optionId === o.id;
                  const cls = reveal && o.isCorrect ? "border-green-500 bg-green-50" : picked ? (reveal ? "border-red-400 bg-red-50" : "border-orange-400 bg-orange-50") : "";
                  return (
                    <div key={o.id} className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${cls}`}>
                      <span className="min-w-0 flex-1"><b>{o.label}.</b> <MathText text={o.content} /><Imgs list={o.images} /></span>
                      {picked && <span className="shrink-0 text-xs font-semibold text-slate-600">Em chọn</span>}
                      {reveal && o.isCorrect && <span className="shrink-0 text-xs font-semibold text-green-700">Đáp án đúng</span>}
                    </div>
                  );
                })}
                {!given.optionId && <p className="text-xs text-slate-500">Em chưa chọn đáp án.</p>}
              </div>
            )}
            {q.type === "TRUE_FALSE_GROUP" && (
              <div className="space-y-2">
                {q.options.map((o) => {
                  const pick = given.picks?.[o.id];
                  const right = typeof pick === "boolean" && pick === o.isCorrect;
                  return (
                    <div key={o.id} className={`flex flex-wrap items-start justify-between gap-2 rounded-md border p-2.5 text-sm ${reveal && typeof pick === "boolean" ? (right ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50") : ""}`}>
                      <span className="min-w-0 flex-1"><b>{o.label})</b> <MathText text={o.content} /><Imgs list={o.images} /></span>
                      <span className="shrink-0 text-xs font-semibold text-slate-600">
                        Em chọn: {typeof pick === "boolean" ? (pick ? "Đúng" : "Sai") : "chưa trả lời"}
                        {reveal && <span className="ml-2 text-green-700">Đáp án: {o.isCorrect ? "Đúng" : "Sai"}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {q.type === "SHORT_ANSWER" && (
              <div className="space-y-1 text-sm">
                <div>Em trả lời: <b className={reveal ? (a?.isCorrect ? "text-green-700" : "text-red-600") : ""}>{given.text?.trim() || "(bỏ trống)"}</b></div>
                {reveal && <div>Đáp án đúng: <b className="text-green-700">{key.answers.join(" / ")}</b>{key.mode === "NUMBER" && key.tolerance ? <span className="text-slate-500"> (sai số ± {fmtPts(key.tolerance)})</span> : null}</div>}
              </div>
            )}
            {reveal && q.explanation && <div className="rounded-md bg-blue-50 p-3 text-sm"><b>Lời giải:</b> <MathText text={q.explanation} /></div>}
          </div>
        );
      })}
    </div>
  );
}


/** Giáo viên: bộ câu hỏi của bài tập (thêm từ ngân hàng, đổi điểm, sắp xếp, bỏ). */
export function QuizManage({ items, exerciseId, locked, stats, candidates }: {
  items: QuizItem[]; exerciseId: string; locked: boolean; stats: Map<string, { right: number; total: number }>;
  candidates: (QuizQ & { gradeName: string | null })[];
}) {
  const total = items.reduce((s, x) => s + x.points, 0);
  return (
    <div className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Câu hỏi của bài tập <span className="font-normal text-slate-500">({items.length} câu · tổng {fmtPts(total)} điểm, quy về thang 10)</span></h3>
        {!locked && (
          <DialogButton label="+ Thêm câu hỏi từ ngân hàng" title="Chọn câu hỏi từ ngân hàng của tôi" size="sm" wide>
            {candidates.length ? (
              <ActionForm action={addQuizQuestions} submit="Thêm vào bài tập" className="flex flex-col gap-3 [&>button]:self-start">
                <input type="hidden" name="exerciseId" value={exerciseId} />
                <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                  {candidates.map((q) => (
                    <label key={q.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm hover:bg-slate-50 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
                      <input type="checkbox" name="questionIds" value={q.id} className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2"><MathText text={q.content || "(Câu hỏi chỉ có ảnh)"} /></span>
                        <span className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">{typeBadge(q.type)}<span>{DIFFICULTY_LABEL[q.difficulty]}</span>{q.gradeName && <span>{q.gradeName}</span>}{q.topic && <span>{q.topic}</span>}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">Điểm mỗi câu<input name="points" defaultValue="1" inputMode="decimal" className={inputCls + " w-20"} /></label>
              </ActionForm>
            ) : (
              <p className="text-sm text-slate-600">Chưa có câu hỏi nào để thêm. Hãy soạn câu hỏi ở <Link href="/ngan-hang-cau-hoi" className="font-medium text-orange-700 hover:underline">Ngân hàng câu hỏi</Link> (cùng môn với bài học này).</p>
            )}
          </DialogButton>
        )}
      </div>
      {locked && <p className="rounded-md bg-yellow-50 p-2.5 text-xs text-yellow-800">Đã có học sinh nộp bài nên không thay đổi được câu hỏi. Muốn sửa, hãy cho học sinh làm lại hoặc tạo bài tập mới.</p>}
      {!items.length && <p className="py-4 text-center text-sm text-slate-500">Chưa có câu hỏi nào. Bấm &quot;+ Thêm câu hỏi từ ngân hàng&quot;.</p>}
      <div className="space-y-2">
        {items.map((it, i) => {
          const st = stats.get(it.question.id);
          return (
            <div key={it.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
              <b className="w-14 shrink-0 text-sm">Câu {i + 1}</b>
              <div className="min-w-48 flex-1 text-sm"><div className="line-clamp-2"><MathText text={it.question.content || "(Câu hỏi chỉ có ảnh)"} /></div><div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">{typeBadge(it.question.type)}{st && st.total > 0 && <span>{st.right}/{st.total} học sinh làm đúng hoàn toàn</span>}</div></div>
              {!locked ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <ActionForm action={setQuizPoints} submit="Lưu" compact reset={false} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={it.id} />
                    <input name="points" defaultValue={fmtPts(it.points)} inputMode="decimal" aria-label="Điểm của câu" className={inputCls + " h-8 w-16 text-center"} />
                  </ActionForm>
                  <span className="text-xs text-slate-500">điểm</span>
                  <ActionForm action={moveQuizQuestion} submit={<ArrowUp className="size-4" />} ghost className="inline-flex"><input type="hidden" name="id" value={it.id} /><input type="hidden" name="dir" value="-1" /></ActionForm>
                  <ActionForm action={moveQuizQuestion} submit={<ArrowDown className="size-4" />} ghost className="inline-flex"><input type="hidden" name="id" value={it.id} /><input type="hidden" name="dir" value="1" /></ActionForm>
                  <ActionForm action={removeQuizQuestion} submit={<Trash2 className="size-4" />} ghost danger confirmText="Bỏ câu này khỏi bài tập? (câu hỏi vẫn còn trong ngân hàng)" className="inline-flex"><input type="hidden" name="id" value={it.id} /></ActionForm>
                </div>
              ) : <span className="text-sm font-medium">{fmtPts(it.points)} điểm</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
