import Link from "next/link";
import { PageCrumbs } from "@/components/page-crumbs";
import { notFound } from "next/navigation";
import { BookMarked } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { AttachmentLinks } from "@/components/attachment-links";
import { AttachmentUpload } from "@/components/attachment-upload";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { MathText } from "@/components/math-text";
import { Card, Field, inputCls, Table, Tabs } from "@/components/ui";
import * as bankRepo from "@/modules/bank/bank.repository";
import * as bank from "@/modules/bank/bank.service";
import { DIFFICULTY_LABEL, TYPE_LABEL } from "@/modules/question/question.grading";
import { ImportDialog } from "@/components/import-dialog";
import { uploadLimit } from "@/lib/storage/config";
import { archiveExerciseAction, archiveLessonAction, assignQuestionsAction, createExerciseAction, updateExerciseAction, updateLessonAction } from "../actions";
import { AddQuestionsDialog, AutoPickDialog, ExerciseFields, QuestionManager, fmtPts, type ExerciseFormData } from "./parts";

const linksOf = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

export default async function LessonBankDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ex?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const readOnly = !me.teacherId; // quản lý/quản trị xem bài học của mọi giáo viên, không sửa
  const { id } = await params;
  const sp = await searchParams;
  const lesson = await bank.viewLesson(me, id).catch(() => null);
  if (!lesson) notFound();
  const back = `/ngan-hang-bai-hoc/${id}?tab=cau-hoi`;

  const [siblings, questions, exercises] = await Promise.all([
    db.libraryLesson.findMany({ where: { teacherId: lesson.teacherId, subjectId: lesson.subjectId, gradeLevelId: lesson.gradeLevelId, archivedAt: null }, orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, orderNo: true } }),
    db.question.findMany({ where: { libraryLessonId: id, archivedAt: null, parentId: null }, orderBy: { createdAt: "desc" } }),
    bankRepo.listExercises(id),
  ]);
  const flaggedHere = questions.filter((q) => q.reviewStatus === "NEEDS_REVIEW").length;

  const TABS: [string, string][] = [["content", "Nội dung"], ["cau-hoi", `Câu hỏi (${questions.length}${flaggedHere ? ` · ${flaggedHere} chờ kiểm tra` : ""})`], ["bai-tap", `Bài tập (${exercises.length})`]];
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "content";
  const tabHref = (k: string) => `?tab=${k}`;
  const ctx = new URLSearchParams({ subjectId: lesson.subjectId, gradeLevelId: lesson.gradeLevelId, lessonId: id, back });

  // ----- Bài tập đang xem -----
  const exFull = tab === "bai-tap" && sp.ex ? await bank.viewExercise(me, sp.ex).catch(() => null) : null;
  const exercise = exFull && exFull.lessonId === id ? exFull : null;
  let pool: Awaited<ReturnType<typeof db.question.findMany<{ include: { libraryLesson: { select: { id: true; title: true } } } }>>> = [];
  let flaggedPool = 0;
  const available: Record<string, number> = {};
  const sourceLessons = exercise ? (exercise.kind === "REVIEW" ? exercise.sources.map((s) => s.lesson) : []) : [];
  if (exercise?.quizMode && !readOnly) {
    const allowed = exercise.kind === "REVIEW" ? [exercise.lessonId, ...exercise.sources.map((s) => s.lessonId)] : [exercise.lessonId];
    const base = { teacherId: lesson.teacherId, subjectId: lesson.subjectId, gradeLevelId: lesson.gradeLevelId, archivedAt: null, parentId: null, libraryLessonId: { in: allowed } };
    const have = exercise.questions.map((q) => q.questionId);
    [pool, flaggedPool] = await Promise.all([
      db.question.findMany({ where: { ...base, reviewStatus: "READY", id: { notIn: have } }, orderBy: { createdAt: "desc" }, include: { libraryLesson: { select: { id: true, title: true } } }, take: 400 }),
      db.question.count({ where: { ...base, reviewStatus: "NEEDS_REVIEW" } }),
    ]);
    const ready = await db.question.groupBy({ by: ["libraryLessonId"], where: { ...base, reviewStatus: "READY" }, _count: { _all: true } });
    for (const r of ready) if (r.libraryLessonId) available[r.libraryLessonId] = r._count._all;
  }
  const unassigned = tab === "cau-hoi" && !readOnly ? await db.question.findMany({ where: { teacherId: lesson.teacherId, subjectId: lesson.subjectId, gradeLevelId: lesson.gradeLevelId, libraryLessonId: null, archivedAt: null, parentId: null }, orderBy: { createdAt: "desc" }, take: 200 }) : [];
  const exForm = (e: NonNullable<typeof exercise>): ExerciseFormData => ({ id: e.id, title: e.title, instructions: e.instructions, showAnswers: e.showAnswers, kind: e.kind, quizMode: e.quizMode, attachments: e.attachments, sourceIds: e.sources.map((s) => s.lessonId) });

  const questionActions = (
    <div className="flex flex-wrap gap-2">
              {unassigned.length > 0 && (
                <DialogButton label="Thêm từ câu chưa phân bài" title="Thêm câu hỏi chưa phân bài vào bài học này" size="sm" variant="secondary" wide>
                  <ActionForm action={assignQuestionsAction} submit="Thêm vào bài học" className="flex flex-col gap-3 [&>button]:self-start">
                    <input type="hidden" name="lessonId" value={id} />
                    <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                      {unassigned.map((q) => <label key={q.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"><input type="checkbox" name="questionIds" value={q.id} className="mt-1" /><span className="line-clamp-2"><MathText text={q.content || "(Câu hỏi chỉ có ảnh)"} /></span></label>)}
                    </div>
                  </ActionForm>
                </DialogButton>
              )}
              <ImportDialog subjectId={lesson.subjectId} gradeLevelId={lesson.gradeLevelId} lessons={siblings} defaultLessonId={id} maxBytes={uploadLimit()} />
              <Link href={`/ngan-hang-cau-hoi/moi?${ctx}`} className="inline-flex h-8 items-center rounded-md bg-orange-600 px-3 text-xs font-medium text-white hover:bg-orange-700">+ Thêm câu hỏi</Link>
            </div>
  );
  const addExerciseAction = (
    <DialogButton label="+ Thêm bài tập" title={`Thêm bài tập · ${lesson.title}`} wide>
              <ActionForm action={createExerciseAction} submit="Tạo bài tập" className="flex flex-col gap-3 [&>button]:self-start"><input type="hidden" name="lessonId" value={id} /><ExerciseFields others={siblings} lessonId={id} /></ActionForm>
            </DialogButton>
  );
  const exerciseActions = exercise ? (
    <><DialogButton label="Sửa bài tập" title="Sửa bài tập" variant="secondary" size="sm" wide>
                <ActionForm action={updateExerciseAction} submit="Lưu" reset={false} className="flex flex-col gap-3 [&>button]:self-start"><input type="hidden" name="id" value={exercise.id} /><ExerciseFields ex={exForm(exercise)} others={siblings} lessonId={id} /></ActionForm>
              </DialogButton>
              <ActionForm action={archiveExerciseAction} submit="Xóa bài tập" compact danger confirmText="Xóa bài tập mẫu này? Các bài đã đăng cho lớp vẫn giữ nguyên." className="inline-flex"><input type="hidden" name="id" value={exercise.id} /></ActionForm></>
  ) : null;
  const tabsRight = readOnly ? undefined : tab === "cau-hoi" ? questionActions : tab === "bai-tap" ? (exercise ? exerciseActions : addExerciseAction) : undefined;

  return (
    <div className="space-y-4">
      <PageCrumbs items={[{ label: "Bài học", href: "/ngan-hang-bai-hoc" }, { label: lesson.subject.subjectName, href: `/ngan-hang-bai-hoc?subjectId=${lesson.subjectId}` }, { label: lesson.gradeLevel.gradeName, href: `/ngan-hang-bai-hoc?${new URLSearchParams({ subjectId: lesson.subjectId, gradeLevelId: lesson.gradeLevelId })}` }, { label: `Bài ${lesson.orderNo}. ${lesson.title}`, href: exercise ? `/ngan-hang-bai-hoc/${id}?tab=bai-tap` : undefined }, ...(exercise ? [{ label: exercise.title }] : [])]} />
      <Card mobile="flat" className="flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><BookMarked className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">Bài {lesson.orderNo}. {lesson.title}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600"><span>{lesson.subject.subjectName} · {lesson.gradeLevel.gradeName}</span>{readOnly && <span>GV: {lesson.teacher.fullName}</span>}<span>{questions.length} câu hỏi</span><span>{exercises.length} bài tập</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && <ActionForm action={archiveLessonAction} submit="Xóa bài học" compact danger confirmText="Xóa bài học này khỏi kho? Câu hỏi của bài chuyển về 'Chưa phân bài', bài tập mẫu bị lưu trữ. Các bài đã đăng cho lớp vẫn giữ nguyên." className="inline-flex"><input type="hidden" name="id" value={id} /></ActionForm>}
        </div>
      </Card>

      <Tabs right={tabsRight} current={tabHref(tab)} items={TABS.map(([k, l]) => [tabHref(k), l] as [string, string])} />

      {tab === "content" && (
        <div className="space-y-3">
          {readOnly ? (
            <Card><p className="whitespace-pre-line text-sm text-slate-700">{lesson.content || "Bài học chưa có nội dung."}</p><AttachmentLinks urls={linksOf(lesson.attachments)} /></Card>
          ) : (
          <Card>
            <ActionForm action={updateLessonAction} submit="Lưu bài học" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
              <input type="hidden" name="id" value={id} />
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                <Field label="Bài số"><input name="orderNo" defaultValue={lesson.orderNo} inputMode="numeric" className={inputCls + " w-full"} /></Field>
                <Field label="Tên bài học"><input name="title" defaultValue={lesson.title} className={inputCls + " w-full"} required /></Field>
              </div>
              <Field label="Nội dung"><textarea name="content" rows={8} defaultValue={lesson.content} className={inputCls + " h-auto w-full py-2"} /></Field>
              <div className="space-y-1 text-xs font-semibold"><p>Tệp đính kèm</p><AttachmentUpload purpose="LIBRARY" initialUrls={linksOf(lesson.attachments)} /></div>
            </ActionForm>
          </Card>
          )}
        </div>
      )}

      {tab === "cau-hoi" && (
        <div className="space-y-3">
          <Table mobileLayout="compact" head={readOnly ? ["Câu hỏi", "Loại", "Độ khó"] : ["Câu hỏi", "Loại", "Độ khó", ""]}>
            {questions.map((q) => (
              <tr key={q.id} className="align-middle [&>td]:!py-3">
                <td className="min-w-56 max-w-lg">{readOnly ? <div className="line-clamp-2 font-medium"><MathText text={q.content || "(Câu hỏi chỉ có ảnh)"} /></div> : <Link data-row href={`/ngan-hang-cau-hoi/${q.id}?${new URLSearchParams({ back })}`} className="line-clamp-2 font-medium hover:text-orange-700"><MathText text={q.content || "(Câu hỏi chỉ có ảnh)"} /></Link>}{q.reviewStatus === "NEEDS_REVIEW" && <span className={`${pill} mt-1 bg-yellow-100 text-yellow-800`}>Chờ kiểm tra</span>}</td>
                <td><span className={`${pill} bg-slate-100 text-slate-700`}>{TYPE_LABEL[q.type]}</span></td>
                <td>{DIFFICULTY_LABEL[q.difficulty]}</td>
                {!readOnly && <td className="text-right"><Link href={`/ngan-hang-cau-hoi/${q.id}?${new URLSearchParams({ back })}`} className="inline-flex h-8 items-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-slate-50">Sửa</Link></td>}
              </tr>
            ))}
            {!questions.length && <tr><td colSpan={readOnly ? 3 : 4} className="py-8 text-center text-slate-500">{readOnly ? "Bài học chưa có câu hỏi." : "Bài học chưa có câu hỏi. Bấm \"+ Thêm câu hỏi\"."}</td></tr>}
          </Table>
        </div>
      )}

      {tab === "bai-tap" && !exercise && (
        <div className="space-y-3">
          <Table mobileLayout="compact" head={["Bài tập", "Loại", "Câu hỏi", "Liên kết bài học", ""]}>
            {exercises.map((e) => (
              <tr key={e.id} className="align-middle [&>td]:!py-3">
                <td className="min-w-48"><Link data-row href={`?tab=bai-tap&ex=${e.id}`} className="font-semibold text-orange-700 hover:underline">{e.title}</Link></td>
                <td>{e.kind === "REVIEW" ? <span className={`${pill} bg-purple-100 text-purple-700`}>Ôn tập</span> : <span className={`${pill} bg-slate-100 text-slate-700`}>Bài tập</span>} <span className="text-xs text-slate-500">{e.quizMode ? "Trắc nghiệm" : "Tự luận"}</span></td>
                <td>{e.quizMode ? e._count.questions : "-"}</td>
                <td className="text-xs text-slate-600">{e.sources.map((s) => s.lesson.title).join(", ") || "-"}</td>
                <td className="text-right"><Link href={`?tab=bai-tap&ex=${e.id}`} className="inline-flex h-8 items-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-slate-50">Mở</Link></td>
              </tr>
            ))}
            {!exercises.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa có bài tập. Bấm &quot;+ Thêm bài tập&quot;.</td></tr>}
          </Table>
        </div>
      )}

      {tab === "bai-tap" && exercise && (
        <div className="space-y-3">
          <Card>
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{exercise.title}</h2>{exercise.kind === "REVIEW" && <span className={`${pill} bg-purple-100 text-purple-700`}>Bài ôn tập</span>}<span className="text-xs text-slate-500">{exercise.quizMode ? "Trắc nghiệm" : "Tự luận"}</span></div>
            {exercise.kind === "REVIEW" && <p className="mt-1 text-sm text-slate-600">Liên kết: {exercise.sources.map((s) => `Bài ${s.lesson.orderNo}. ${s.lesson.title}`).join(" · ") || "chưa liên kết bài nào"}</p>}
            {exercise.instructions && <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{exercise.instructions}</p>}
            <AttachmentLinks urls={linksOf(exercise.attachments)} />
          </Card>
          {exercise.quizMode ? (
            <div className="space-y-3 rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Câu hỏi <span className="font-normal text-slate-500">({exercise.questions.length} câu · tổng {fmtPts(exercise.questions.reduce((s, q) => s + q.points, 0))} điểm, quy về thang 10)</span></h3>
                {!readOnly && <div className="flex flex-wrap gap-2">
                  <AutoPickDialog exerciseId={exercise.id} sources={exercise.kind === "REVIEW" && sourceLessons.length ? sourceLessons.map((l) => ({ id: l.id, title: l.title, orderNo: l.orderNo })) : [{ id: lesson.id, title: lesson.title, orderNo: lesson.orderNo }]} available={available} />
                  <AddQuestionsDialog exerciseId={exercise.id} pool={pool} flagged={flaggedPool} />
                </div>}
              </div>
              <QuestionManager rows={exercise.questions} showSource={exercise.kind === "REVIEW"} readOnly={readOnly} />
            </div>
          ) : <Card className="text-sm text-slate-600">Bài tập tự luận: học sinh nộp bài viết hoặc tệp, giáo viên chấm điểm sau khi đăng cho lớp.</Card>}
        </div>
      )}
    </div>
  );
}
