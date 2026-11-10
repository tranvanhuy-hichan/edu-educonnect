import Link from "next/link";
import { requireRole } from "@/lib/guard";
import { loadClassYearReview } from "@/modules/promotion/promotion.service";
import { loadAnnualSubjects } from "@/modules/scoring/annual-query";
import { suggestPromotion } from "@/modules/scoring/annual";
import { ActionForm } from "@/components/action-form";
import { Table, Field, inputCls } from "@/components/ui";
import { saveClassResults, reviewResult } from "@/app/(app)/len-lop/actions";

const RESULT_LABEL = { CHUA_DU_DIEU_KIEN: "Chưa đủ điều kiện xét", LEN_LOP: "Đủ điều kiện lên lớp", O_LAI: "Ở lại", THI_LAI: "Cần đánh giá lại / rèn luyện hè" };
const STATUS_LABEL = { DRAFT: "Nháp", SUBMITTED: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Trả lại" };
export async function YearResults({ classId, academicYearId, manager }: { classId: string; academicYearId: string; manager: boolean }) {
  const user = await requireRole();
  const enrollments = await loadClassYearReview(user, classId, academicYearId);
  const subjects = await Promise.all(enrollments.map((row) => loadAnnualSubjects(row.studentId, academicYearId)));
  const rows = enrollments.map((row, index) => {
    const saved = row.student.yearEndResults[0];
    return { student: row.student, saved, subjects: subjects[index], evaluation: suggestPromotion(subjects[index], saved?.conductRank, saved?.absenceDays) };
  });
  const writable = rows.filter((row) => row.saved?.reviewStatus !== "APPROVED");
  return <div className="space-y-4">
    <p className="text-sm text-slate-500">Điểm cả năm từng môn = (HK1 + HK2 × 2) / 3. Thiếu điểm/nhận xét sẽ chưa đủ điều kiện xét. TB các môn chỉ để tham khảo; kết quả học tập xét theo từng môn.</p>
    <ActionForm action={saveClassResults} submit="Tổng hợp và trình duyệt" reset={false} className="flex flex-col gap-3 [&>button]:self-end">
      <input type="hidden" name="academicYearId" value={academicYearId} /><input type="hidden" name="ids" value={writable.map((row) => row.student.id).join(",")} />
      <Table head={["Học sinh", "Kết quả theo môn", "Rèn luyện cả năm", "Buổi nghỉ cả năm", "Đề xuất / trạng thái"]}>
        {rows.map(({ student, saved, subjects, evaluation }) => <tr key={student.id}>
          <td><Link href={`/hoc-sinh/${student.id}`} className="font-semibold hover:text-orange-700">{student.fullName}</Link><p className="text-xs text-slate-500">{student.code}</p></td>
          <td><details><summary className="cursor-pointer text-xs text-orange-700">{subjects.length} môn · TB tham khảo {evaluation.overallAverage?.toFixed(1) ?? "—"}</summary><ul className="mt-2 space-y-1 text-xs">{subjects.map((subject) => <li key={subject.subjectId}><b>{subject.name}</b>: {subject.exempt ? "Miễn đánh giá" : subject.type === "COMMENT" ? subject.outcome === "DAT" ? "Đạt" : subject.outcome === "CHUA_DAT" ? "Chưa đạt" : "Chưa đánh giá" : `${subject.first ?? "—"} / ${subject.second ?? "—"} → ${subject.average ?? "—"}`}{subject.missing.length > 0 && <p className="text-amber-700">{subject.missing.join("; ")}</p>}</li>)}</ul></details></td>
          <td><select disabled={saved?.reviewStatus === "APPROVED"} name={`conduct_${student.id}`} defaultValue={saved?.conductRank ?? ""} className={inputCls}><option value="">Chưa đánh giá</option>{["Tốt", "Khá", "Đạt", "Chưa đạt"].map((value) => <option key={value}>{value}</option>)}</select></td>
          <td><input disabled={saved?.reviewStatus === "APPROVED"} name={`absence_${student.id}`} type="number" min={0} max={366} defaultValue={saved?.absenceDays ?? ""} placeholder="Chưa xác nhận" className={inputCls + " w-36"} /><p className="mt-1 text-[11px] text-slate-500">Theo sổ theo dõi, gồm có phép/không phép</p></td>
          <td><input type="hidden" name={`result_${student.id}`} value="CHUA_DU_DIEU_KIEN" /><p className="text-xs font-medium">{RESULT_LABEL[evaluation.result]}</p><p className="mt-1 text-xs text-slate-500">{saved ? STATUS_LABEL[saved.reviewStatus] : "Chưa tổng hợp"}{evaluation.learningRank && ` · Học tập: ${evaluation.learningRank}`}</p>{evaluation.missing.length > 0 && <details className="mt-1 text-xs text-amber-700"><summary className="cursor-pointer">Dữ liệu còn thiếu</summary><ul>{evaluation.missing.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}</td>
        </tr>)}
        {!rows.length && <tr><td colSpan={5}>Lớp chưa có học sinh.</td></tr>}
      </Table>
    </ActionForm>
    {manager && rows.filter((row) => row.saved && ["SUBMITTED", "APPROVED"].includes(row.saved.reviewStatus)).map(({ student, saved }) => <div key={student.id} className="rounded-xl border bg-white p-4">
      <p className="mb-2 text-sm font-semibold">{student.fullName} · {STATUS_LABEL[saved!.reviewStatus]}</p>
      <ActionForm action={reviewResult} submit={saved!.reviewStatus === "APPROVED" ? "Mở lại hồ sơ" : "Phê duyệt kết quả"} reset={false} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="studentId" value={student.id} /><input type="hidden" name="academicYearId" value={academicYearId} /><input type="hidden" name="approve" value={saved!.reviewStatus === "APPROVED" ? "false" : "true"} />
        <Field label="Lý do / xác nhận rà soát"><input required minLength={10} name="reason" className={inputCls + " sm:w-96"} /></Field>
      </ActionForm>
    </div>)}
  </div>;
}
