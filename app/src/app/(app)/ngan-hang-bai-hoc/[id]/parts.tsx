import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { AttachmentUpload } from "@/components/attachment-upload";
import { DialogButton } from "@/components/dialog";
import { MathText } from "@/components/math-text";
import { Field, inputCls } from "@/components/ui";
import { DIFFICULTY_LABEL, TYPE_LABEL } from "@/modules/question/question.grading";
import { addExerciseQuestions, autoPickAction, moveExerciseQuestion, removeExerciseQuestion, setExercisePoints } from "../actions";

export const fmtPts = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const badge = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
const radioCard = "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50";

type LessonRef = { id: string; title: string; orderNo: number };
export type ExerciseFormData = { id: string; title: string; instructions: string; showAnswers: string; kind: string; quizMode: boolean; attachments: unknown; sourceIds: string[] };

/** Trường nhập chung cho bài tập mẫu (tạo mới hoặc sửa). */
export function ExerciseFields({ ex, others, lessonId }: { ex?: ExerciseFormData; others: LessonRef[]; lessonId: string }) {
  const earlier = others.filter((l) => l.id !== lessonId);
  const sourceBox = (
    <div className="space-y-1 text-xs font-medium text-slate-600">
      <p>Liên kết các bài học trước (câu hỏi của các bài này dùng để ôn tập)</p>
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
        {earlier.map((l) => (
          <label key={l.id} className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="sourceLessonIds" value={l.id} defaultChecked={ex ? ex.sourceIds.includes(l.id) : l.orderNo < (others.find((x) => x.id === lessonId)?.orderNo ?? 0)} />Bài {l.orderNo}. {l.title}</label>
        ))}
        {!earlier.length && <p className="text-sm font-normal text-slate-500">Chưa có bài học nào khác cùng môn và khối.</p>}
      </div>
    </div>
  );
  return (
    <div className="group/q flex flex-col gap-3">
      {!ex && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={radioCard}><input type="radio" name="kind" value="NORMAL" defaultChecked className="mt-1" /><span><b>Bài tập của bài học</b><br /><span className="text-xs font-normal text-slate-500">Lấy câu hỏi của chính bài học này</span></span></label>
            <label className={radioCard}><input type="radio" name="kind" value="REVIEW" className="mt-1" /><span><b>Bài ôn tập</b><br /><span className="text-xs font-normal text-slate-500">Liên kết các bài học trước, lấy câu hỏi từ các bài đó</span></span></label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={radioCard}><input type="radio" name="quizMode" value="1" defaultChecked className="mt-1" /><span><b>Trắc nghiệm</b><br /><span className="text-xs font-normal text-slate-500">Tự chấm điểm</span></span></label>
            <label className={radioCard}><input type="radio" name="quizMode" value="0" className="mt-1" /><span><b>Tự luận</b><br /><span className="text-xs font-normal text-slate-500">Học sinh nộp bài, giáo viên chấm</span></span></label>
          </div>
        </>
      )}
      <Field label="Tên bài tập"><input name="title" defaultValue={ex?.title} className={inputCls + " w-full"} required /></Field>
      <Field label="Đề bài / hướng dẫn làm bài"><textarea name="instructions" rows={3} defaultValue={ex?.instructions} className={inputCls + " h-auto w-full py-2"} /></Field>
      <Field label="Khi nào học sinh được xem đáp án đúng (bài trắc nghiệm)">
        <select name="showAnswers" defaultValue={ex?.showAnswers ?? "AFTER_DUE"} className={inputCls + " w-full"}>
          <option value="AFTER_DUE">Sau hạn nộp (không có hạn thì ngay sau khi nộp)</option><option value="AFTER_SUBMIT">Ngay sau khi học sinh nộp bài</option><option value="NEVER">Không công khai đáp án</option>
        </select>
      </Field>
      {ex ? (ex.kind === "REVIEW" ? sourceBox : null) : <div className="hidden group-has-[input[name=kind][value='REVIEW']:checked]/q:block">{sourceBox}</div>}
      <div className="space-y-1 text-xs font-semibold"><p>Tệp đính kèm</p><AttachmentUpload purpose="LIBRARY" initialUrls={Array.isArray(ex?.attachments) ? (ex!.attachments as string[]) : []} /></div>
    </div>
  );
}

type QRow = { id: string; order: number; points: number; question: { content: string; type: string; difficulty: string; reviewStatus: string; archivedAt: Date | null; libraryLesson: { id: string; title: string } | null } };

/** Danh sách câu hỏi của bài tập mẫu: đổi điểm, thứ tự, bỏ câu. */
export function QuestionManager({ rows, showSource, readOnly = false }: { rows: QRow[]; showSource: boolean; readOnly?: boolean }) {
  return (
    <div className="space-y-2">
      {!rows.length && <p className="py-4 text-center text-sm text-slate-500">{readOnly ? "Chưa có câu hỏi nào." : "Chưa có câu hỏi nào. Thêm câu hỏi từ ngân hàng hoặc bốc tự động."}</p>}
      {rows.map((r, i) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-white p-2.5">
          <b className="w-14 shrink-0 text-sm">Câu {i + 1}</b>
          <div className="min-w-48 flex-1 text-sm">
            <div className="line-clamp-2"><MathText text={r.question.content || "(Câu hỏi chỉ có ảnh)"} /></div>
            <div className="mt-1 flex flex-wrap gap-2"><span className={`${badge} bg-slate-100 text-slate-600`}>{TYPE_LABEL[r.question.type]}</span><span className={`${badge} bg-slate-100 text-slate-600`}>{DIFFICULTY_LABEL[r.question.difficulty]}</span>
              {showSource && r.question.libraryLesson && <span className={`${badge} bg-blue-50 text-blue-700`}>{r.question.libraryLesson.title}</span>}
              {(r.question.reviewStatus !== "READY" || r.question.archivedAt) && <span className={`${badge} bg-yellow-100 text-yellow-800`}>{r.question.archivedAt ? "Đã xóa khỏi ngân hàng" : "Chờ kiểm tra"}</span>}</div>
          </div>
          {readOnly ? <span className="text-sm font-medium">{fmtPts(r.points)} điểm</span> : <div className="flex flex-wrap items-center gap-1.5">
            <ActionForm action={setExercisePoints} submit="Lưu" compact reset={false} className="flex items-center gap-1.5"><input type="hidden" name="id" value={r.id} /><input name="points" defaultValue={fmtPts(r.points)} inputMode="decimal" aria-label="Điểm của câu" className={inputCls + " h-8 w-16 text-center"} /></ActionForm>
            <span className="text-xs text-slate-500">điểm</span>
            <ActionForm action={moveExerciseQuestion} submit={<ArrowUp className="size-4" />} ghost className="inline-flex"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="dir" value="-1" /></ActionForm>
            <ActionForm action={moveExerciseQuestion} submit={<ArrowDown className="size-4" />} ghost className="inline-flex"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="dir" value="1" /></ActionForm>
            <ActionForm action={removeExerciseQuestion} submit={<Trash2 className="size-4" />} ghost danger confirmText="Bỏ câu này khỏi bài tập? (câu hỏi vẫn còn trong ngân hàng)" className="inline-flex"><input type="hidden" name="id" value={r.id} /></ActionForm>
          </div>}
        </div>
      ))}
    </div>
  );
}

type PoolQ = { id: string; content: string; type: string; difficulty: string; topic: string | null; libraryLesson: { id: string; title: string } | null };

export function AddQuestionsDialog({ exerciseId, pool, flagged }: { exerciseId: string; pool: PoolQ[]; flagged: number }) {
  const groups = new Map<string, { title: string; items: PoolQ[] }>();
  for (const q of pool) { const k = q.libraryLesson?.id ?? "-"; (groups.get(k) ?? groups.set(k, { title: q.libraryLesson?.title ?? "Chưa phân bài", items: [] }).get(k)!).items.push(q); }
  return (
    <DialogButton label="+ Thêm câu hỏi" title="Chọn câu hỏi cho bài tập" size="sm" wide>
      {flagged > 0 && <p className="mb-3 rounded-md bg-yellow-50 p-2.5 text-xs text-yellow-800">{flagged} câu đang chờ kiểm tra nên không hiện ở đây. Hãy duyệt trong Ngân hàng câu hỏi.</p>}
      {pool.length ? (
        <ActionForm action={addExerciseQuestions} submit="Thêm vào bài tập" className="flex flex-col gap-3 [&>button]:self-start">
          <input type="hidden" name="exerciseId" value={exerciseId} />
          <div className="max-h-[48vh] space-y-4 overflow-y-auto pr-1">
            {[...groups.values()].map((g) => (
              <div key={g.title} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title} ({g.items.length})</div>
                {g.items.map((q) => (
                  <label key={q.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm hover:bg-slate-50 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
                    <input type="checkbox" name="questionIds" value={q.id} className="mt-1" />
                    <span className="min-w-0 flex-1"><span className="line-clamp-2"><MathText text={q.content || "(Câu hỏi chỉ có ảnh)"} /></span>
                      <span className="mt-1 flex flex-wrap gap-2"><span className={`${badge} bg-slate-100 text-slate-600`}>{TYPE_LABEL[q.type]}</span><span className={`${badge} bg-slate-100 text-slate-600`}>{DIFFICULTY_LABEL[q.difficulty]}</span></span></span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">Điểm mỗi câu<input name="points" defaultValue="1" inputMode="decimal" className={inputCls + " w-20"} /></label>
        </ActionForm>
      ) : <p className="text-sm text-slate-600">Không còn câu hỏi nào để thêm (đã thêm hết hoặc chưa có câu hỏi sẵn sàng).</p>}
    </DialogButton>
  );
}

/** Bốc ngẫu nhiên: số câu theo từng bài học nguồn + tỉ lệ độ khó. */
export function AutoPickDialog({ exerciseId, sources, available }: { exerciseId: string; sources: LessonRef[]; available: Record<string, number> }) {
  return (
    <DialogButton label="Bốc tự động" title="Bốc câu hỏi ngẫu nhiên" size="sm" variant="secondary" wide>
      <ActionForm action={autoPickAction} submit="Bốc câu hỏi" reset={false} className="flex flex-col gap-4 [&>button]:self-start">
        <input type="hidden" name="exerciseId" value={exerciseId} />
        <div className="space-y-2">
          <div className="text-sm font-semibold">Số câu lấy từ mỗi bài học</div>
          {sources.map((l) => (
            <label key={l.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm">
              <span>Bài {l.orderNo}. {l.title} <span className="text-xs text-slate-500">({available[l.id] ?? 0} câu sẵn sàng)</span></span>
              <input name={`pl_${l.id}`} defaultValue="" inputMode="numeric" placeholder="0" className={inputCls + " w-20 text-center"} />
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Tỉ lệ độ khó (không bắt buộc)</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Dễ"><input name="rEasy" defaultValue="" inputMode="numeric" placeholder="vd 4" className={inputCls} /></Field>
            <Field label="Trung bình"><input name="rMedium" defaultValue="" inputMode="numeric" placeholder="vd 4" className={inputCls} /></Field>
            <Field label="Khó"><input name="rHard" defaultValue="" inputMode="numeric" placeholder="vd 2" className={inputCls} /></Field>
          </div>
          <p className="text-xs text-slate-500">Tỉ lệ tương đối: 4 : 4 : 2 nghĩa là 40% dễ, 40% trung bình, 20% khó. Để trống nếu không cần.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">Điểm mỗi câu<input name="points" defaultValue="1" inputMode="decimal" className={inputCls + " w-20"} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="replace" value="1" />Thay thế các câu hiện có (bốc lại từ đầu)</label>
        </div>
      </ActionForm>
    </DialogButton>
  );
}
