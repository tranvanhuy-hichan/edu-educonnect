import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Field, inputCls } from "@/components/ui";
import { saveAssessment } from "../assessment-actions";

export async function Assessments({ assignmentId, students, commentOnly, readOnly, manager }: { assignmentId: string; students: { id: string; name: string; code: string }[]; commentOnly: boolean; readOnly: boolean; manager: boolean }) {
  const reviews = await db.studentAssessment.findMany({ where: { assignmentId } });
  const byStudent = new Map(reviews.map((review) => [review.studentId, review]));
  return <details open={commentOnly} className="content-panel rounded-xl border bg-white p-4">
    <summary className="cursor-pointer font-semibold">{commentOnly ? "Đánh giá Đạt / Chưa đạt" : "Nhận xét, miễn và điều chỉnh đánh giá"}</summary>
    <p className="my-3 text-xs text-slate-500">Kết quả theo học kỳ. Miễn/điều chỉnh cần căn cứ và quyền quản lý; không tự quy đổi thành điểm số.</p>
    <div className="space-y-3">{students.map((student) => { const review = byStudent.get(student.id); return <div key={student.id} className="rounded-lg border p-3">
      <p className="mb-2 text-sm font-semibold">{student.name} · {student.code}</p>
      {readOnly ? <p className="text-sm">{review?.isExempt ? "Miễn đánh giá" : review?.outcome === "DAT" ? "Đạt" : review?.outcome === "CHUA_DAT" ? "Chưa đạt" : "Chưa đánh giá"} · {review?.comment} {review?.decisionReference && `· Căn cứ: ${review.decisionReference}`}</p> : <ActionForm action={saveAssessment} submit="Lưu đánh giá" reset={false} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="assignmentId" value={assignmentId} /><input type="hidden" name="studentId" value={student.id} />
        {commentOnly && <Field label="Kết quả"><select name="outcome" defaultValue={review?.outcome ?? ""} className={inputCls}><option value="">Chưa đánh giá</option><option value="DAT">Đạt</option><option value="CHUA_DAT">Chưa đạt</option></select></Field>}
        <Field label="Nhận xét"><input name="comment" defaultValue={review?.comment ?? ""} className={inputCls} /></Field>
        {manager && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isExempt" defaultChecked={review?.isExempt} />Miễn đánh giá theo quyết định</label><Field label="Nội dung điều chỉnh"><input name="adjustmentReason" defaultValue={review?.adjustmentReason ?? ""} className={inputCls} /></Field><Field label="Số quyết định / căn cứ"><input name="decisionReference" defaultValue={review?.decisionReference ?? ""} className={inputCls} /></Field></>}
        <Field label="Lý do cập nhật"><input required minLength={5} name="reason" className={inputCls} /></Field>
      </ActionForm>}
    </div>; })}</div>
  </details>;
}
