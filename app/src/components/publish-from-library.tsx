import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Field, inputCls } from "@/components/ui";
import { publishLessonToClassAction } from "@/app/(app)/ngan-hang-bai-hoc/actions";

export type LibraryLessonOption = { id: string; title: string; orderNo: number; exercises: { id: string; title: string; kind: string; quizMode: boolean; _count: { questions: number } }[] };

/** Nút + hộp thoại "Đăng bài học từ kho" cho một lớp-môn (có thể nhiều học kỳ). Dùng ở Lớp của tôi và Giảng dạy. */
export function PublishFromLibrary({ className, subjectName, gradeName, assignments, library, publishedLessonIds }: {
  className: string; subjectName: string; gradeName: string;
  assignments: { id: string; label: string }[]; library: LibraryLessonOption[]; publishedLessonIds: string[];
}) {
  return (
    <DialogButton label="Đăng bài học từ kho" title={`Đăng bài học cho ${className}`} variant="secondary" wide>
      {!library.length ? <p className="text-sm text-slate-600">Bạn chưa có bài học nào trong kho cho {subjectName} · {gradeName}. Tạo ở mục <Link href="/ngan-hang-bai-hoc" className="font-medium text-orange-700 hover:underline">Bài học</Link>.</p> : (
        <ActionForm action={publishLessonToClassAction} submit="Đăng cho lớp" reset={false} className="flex flex-col gap-4 [&>button]:self-start">
          {assignments.length > 1
            ? <Field label="Học kỳ"><select name="assignmentId" className={inputCls + " w-full"} required>{assignments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
            : <input type="hidden" name="assignmentId" value={assignments[0].id} />}
          <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
            {library.map((l) => (
              <div key={l.id} className="space-y-2 rounded-md border p-3 has-[input[name=lessonId]:checked]:border-orange-500 has-[input[name=lessonId]:checked]:bg-orange-50/50">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input type="radio" name="lessonId" value={l.id} required />Bài {l.orderNo}. {l.title}{publishedLessonIds.includes(l.id) && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">Đã đăng</span>}</label>
                {l.exercises.map((e) => (
                  <div key={e.id} className="ml-6 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" name={`ex_${l.id}`} value={e.id} />{e.title}{e.kind === "REVIEW" && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">Ôn tập</span>}<span className="text-xs text-slate-500">{e.quizMode ? `${e._count.questions} câu` : "Tự luận"}</span></label>
                    <label className="flex items-center gap-2 text-xs text-slate-600">Hạn nộp<input type="date" name={`due_${e.id}`} className={inputCls + " h-8"} /></label>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">Lớp nhận một bản sao độc lập của bài học. Đã đăng rồi thì chỉ thêm các bài tập chưa đăng.</p>
        </ActionForm>
      )}
    </DialogButton>
  );
}
