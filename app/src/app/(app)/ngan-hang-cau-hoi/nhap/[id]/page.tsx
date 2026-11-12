import Link from "next/link";
import { PageCrumbs } from "@/components/page-crumbs";
import { notFound, redirect } from "next/navigation";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { MathText } from "@/components/math-text";
import { Card, Title } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { DIFFICULTY_LABEL, TYPE_LABEL, readAnswerKey } from "@/modules/question/question.grading";
import { getImportJob } from "@/modules/importer/importer.service";
import { approveAll, approveOne } from "../actions";
import { AutoRefresh } from "../auto-refresh";
import { KIND_LABEL, StatusBadge } from "../status";

const urls = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

function Images({ list }: { list: unknown }) {
  const u = urls(list);
  if (!u.length) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-2">
      {u.map((src) => (
        <a key={src} href={src} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Hình trong câu hỏi" loading="lazy" className="max-h-40 max-w-full rounded-md border bg-white object-contain" />
        </a>
      ))}
    </span>
  );
}

export default async function ImportJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  if (!me.teacherId) redirect("/ngan-hang-cau-hoi");
  const { id } = await params;
  const data = await getImportJob(me, id);
  if (!data) notFound();
  const { job, questions } = data;
  const active = job.status === "PENDING" || job.status === "RUNNING";
  const warnings = Array.isArray(job.warnings) ? (job.warnings as string[]) : [];
  // câu chờ kiểm tra lên đầu, giữ nguyên thứ tự trong tài liệu ở mỗi nhóm
  const order = new Map(questions.map((q, i) => [q.id, i]));
  const sorted = [...questions].sort((a, b) => Number(b.reviewStatus === "NEEDS_REVIEW") - Number(a.reviewStatus === "NEEDS_REVIEW") || order.get(a.id)! - order.get(b.id)!);
  const pending = questions.filter((q) => q.reviewStatus === "NEEDS_REVIEW").length;

  return (
    <div className="space-y-4">
      <AutoRefresh active={active} />
      <PageCrumbs items={[{ label: "Ngân hàng câu hỏi", href: "/ngan-hang-cau-hoi" }, { label: "Phiên nhập AI", href: "/ngan-hang-cau-hoi/nhap" }, { label: job.fileName }]} />
      <Title>{job.fileName}</Title>

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <StatusBadge status={job.status} />
        <span>{KIND_LABEL[job.kind] ?? job.kind}</span>
        <span>{job.subject.subjectName} · {job.gradeLevel.gradeName}</span>
        {job.libraryLesson && <span>Bài học: <Link href={`/ngan-hang-bai-hoc/${job.libraryLesson.id}`} className="font-medium text-orange-700 hover:underline">{job.libraryLesson.title}</Link></span>}
        <span className="text-slate-500">Tạo lúc {fmtTime(job.createdAt)}</span>
        {job.status === "DONE" && <span><b>{job.questionCount}</b> câu · <b className={pending ? "text-amber-700" : "text-green-700"}>{pending}</b> chờ kiểm tra</span>}
      </Card>

      {active && <Card className="text-sm text-slate-600">AI đang đọc tệp. Trang tự cập nhật, bạn có thể rời đi và quay lại sau, kết quả vẫn được lưu.</Card>}
      {job.status === "FAILED" && <Card className="border-red-300 bg-red-50 text-sm text-red-800"><b>Không nhập được.</b> {job.error}</Card>}
      {warnings.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 text-sm text-amber-900">
          <b>Lưu ý từ AI</b>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Card>
      )}

      {job.status === "DONE" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Câu hỏi đã nhập ({questions.length})</h2>
            {pending > 0 && <ActionForm action={approveAll} submit={`Duyệt tất cả (${pending})`} reset={false} confirmText="Xác nhận tất cả các câu đang chờ kiểm tra là đúng? Hãy chắc chắn bạn đã xem lại đáp án." className="inline-flex flex-wrap items-center gap-2"><input type="hidden" name="jobId" value={job.id} /></ActionForm>}
          </div>
          {job.libraryExerciseId && job.libraryLesson && (
            <Card className="text-sm text-slate-600">Đề đã được tạo thành bài tập mẫu trong bài học <Link href={`/ngan-hang-bai-hoc/${job.libraryLesson.id}?tab=bai-tap&ex=${job.libraryExerciseId}`} className="font-medium text-orange-700 hover:underline">{job.libraryLesson.title}</Link>. Câu chờ kiểm tra chưa đăng được cho lớp cho đến khi được duyệt.</Card>
          )}
          <div className="space-y-3">
            {sorted.map((q, idx) => {
              const key = readAnswerKey(q.answerKey);
              const review = q.reviewStatus === "NEEDS_REVIEW";
              return (
                <div key={q.id} className={`space-y-2 rounded-lg border bg-white p-4 ${review ? "border-amber-400" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <b className="text-sm">#{idx + 1}</b>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{TYPE_LABEL[q.type] ?? q.type}</span>
                    <span className="text-slate-500">{DIFFICULTY_LABEL[q.difficulty]}</span>
                    {q.topic && <span className="text-slate-500">{q.topic}</span>}
                    {review ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">Chờ kiểm tra</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-800">Đã duyệt</span>}
                    <span className="ml-auto flex items-center gap-2">
                      <Link href={`/ngan-hang-cau-hoi/${q.id}`} className="inline-flex h-8 items-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-slate-50">Sửa</Link>
                      {review && <ActionForm action={approveOne} submit="Duyệt" compact reset={false} className="inline-flex"><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="questionId" value={q.id} /></ActionForm>}
                    </span>
                  </div>
                  {review && q.reviewNote && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">{q.reviewNote}</p>}
                  <div className="text-sm"><MathText text={q.content || "(Câu hỏi chỉ có ảnh)"} /></div>
                  <Images list={q.images} />
                  {q.type !== "SHORT_ANSWER" && (
                    <ul className="space-y-1 text-sm">
                      {q.options.map((o) => (
                        <li key={o.id} className={`rounded-md border px-2.5 py-1.5 ${o.isCorrect ? "border-green-400 bg-green-50" : ""}`}>
                          <b>{o.label}{q.type === "TRUE_FALSE_GROUP" ? ")" : "."}</b> <MathText text={o.content} /><Images list={o.images} />
                          {q.type === "TRUE_FALSE_GROUP" && <span className={`ml-2 text-xs font-semibold ${o.isCorrect ? "text-green-700" : "text-red-600"}`}>{o.isCorrect ? "Đúng" : "Sai"}</span>}
                          {q.type === "SINGLE_CHOICE" && o.isCorrect && <span className="ml-2 text-xs font-semibold text-green-700">Đáp án đúng</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.type === "SHORT_ANSWER" && (
                    <p className="text-sm">Đáp án: {key.answers.length ? <b className="text-green-700">{key.answers.join(" / ")}</b> : <span className="text-red-600">chưa có</span>}{key.mode === "NUMBER" && key.tolerance ? <span className="text-slate-500"> (sai số ± {key.tolerance})</span> : null}</p>
                  )}
                  {q.explanation && <div className="rounded-md bg-blue-50 p-2 text-sm"><b>Lời giải:</b> <MathText text={q.explanation} /></div>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
