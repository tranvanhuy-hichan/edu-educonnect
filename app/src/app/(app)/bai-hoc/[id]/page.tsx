import { AttachmentLinks } from "@/components/attachment-links";
import { PageCrumbs } from "@/components/page-crumbs";
import { AttachmentUpload } from "@/components/attachment-upload";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Eye } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls, Table, Tabs } from "@/components/ui";
import { fmtDate, todayUTC } from "@/lib/format";
import { viewLessonPost } from "@/modules/content/content.service";
import { assignmentWhere, isManager, isStudentOnly } from "@/server/learning-scope";
import { createExercise, deleteExercise, deletePost, gradeWork, reportViolation, resetQuiz, startAttempt, submitQuizWork, submitWork, updateExercise, updatePost } from "../actions";
import { ExamRunner } from "./secure-quiz";
import { SCORING_LABEL, shuffleSeedFor } from "@/modules/question/quiz-attempts";
import { AttemptFields, SecureModeFields, ShuffleFields } from "@/components/secure-mode-fields";
import { arrangeForStudent } from "@/modules/question/quiz-shuffle";
import { VIOLATION_LABEL } from "@/modules/question/quiz.service";
import { canRevealKey, quizAttemptState } from "@/modules/question/quiz.service";
import { QuizManage, QuizReview, QuizTake, fmtPts, type QuizItem } from "./quiz-parts";
import { libraryExercisesForPost } from "@/modules/bank/bank.service";
import { publishExerciseToPostAction } from "../../ngan-hang-bai-hoc/actions";

const fmtTime = (d: Date) => `${fmtDate(d)} ${new Date(d.getTime() + 7 * 3600_000).toISOString().slice(11, 16)}`;
const linksOf = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

export default async function LessonPostDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ex?: string; retry?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES, "STUDENT");
  const { id } = await params;
  const sp = await searchParams;
  const student = isStudentOnly(me);

  // Học sinh: số lượt đã dùng/còn lại, lượt đang dở, lịch sử điểm. Chạy trước khi tải bài (có thể đóng lượt đã quá giờ).
  const attemptState = student && sp.tab === "bai-tap" && sp.ex ? await quizAttemptState(me, sp.ex).catch(() => null) : null;
  const post = await db.lessonPost.findFirst({
    where: { id, assignment: assignmentWhere(me) },
    include: {
      assignment: { include: { schoolClass: { include: { enrollments: { where: !student && (sp.tab === "views" || (sp.tab === "bai-tap" && !!sp.ex)) ? {} : { id: "-" }, select: { studentId: true, student: { select: { id: true, fullName: true, code: true } } } }, _count: { select: { enrollments: true } } } }, subject: true, academicTerm: true, teacher: { select: { id: true, fullName: true } } } },
      exercises: { orderBy: { createdAt: "asc" }, include: { submissions: { where: student ? { studentId: sp.tab === "bai-tap" ? me.studentId ?? "-" : "-" } : { exerciseId: sp.tab === "bai-tap" ? sp.ex ?? "-" : "-" } }, _count: { select: { questions: true, submissions: true } } } },
    },
  });
  if (!post) notFound();
  const a = post.assignment;
  const gradeName = student ? "" : (await db.gradeLevel.findUnique({ where: { id: a.schoolClass.gradeLevelId }, select: { gradeName: true } }))?.gradeName ?? "Khối";
  const manage = !student && (await canManageClassSubjectAssignment(me, a.id));

  // học sinh mở bài = ghi nhận "đã xem" theo từng người (không chỉ đếm lượt)
  if (student) await viewLessonPost(me, id).catch(() => null);

  const seen = new Set<string>();
  const roster = a.schoolClass.enrollments.filter((e) => !seen.has(e.studentId) && seen.add(e.studentId)).map((e) => e.student).sort((x, y) => x.fullName.localeCompare(y.fullName, "vi"));
  const [views, viewCount, gradedCounts] = await Promise.all([
    sp.tab === "views" && !student ? db.lessonPostView.findMany({ where: { lessonPostId: id }, select: { id: true, studentId: true, viewedAt: true } }) : Promise.resolve([]),
    db.lessonPostView.count({ where: { lessonPostId: id } }),
    sp.tab === "bai-tap" && !post.exercises.some((e) => e.id === sp.ex) && !student ? db.assignmentSubmission.groupBy({ by: ["exerciseId"], where: { exercise: { lessonPostId: id }, grade: { not: null } }, _count: { _all: true } }) : Promise.resolve([]),
  ]);
  const gradedOf = new Map(gradedCounts.map((row) => [row.exerciseId, row._count._all]));
  const viewOf = new Map(views.map((v) => [v.studentId, v]));
  const links = linksOf(post.attachments);
  const today = todayUTC();

  const TABS: [string, string][] = [
    ["content", "Nội dung"],
    ["bai-tap", `Bài tập (${post.exercises.length})`],
    ...(student ? [] : [["views", `Ai đã xem (${viewCount}/${a.schoolClass._count.enrollments})`] as [string, string]]),
  ];
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "content";
  const exercise = post.exercises.find((e) => e.id === sp.ex);
  const tabHref = (k: string) => `?tab=${k}`;
  const libExercises = manage && tab === "bai-tap" && !exercise ? await libraryExercisesForPost(me, id) : [];

  // Bài tập trắc nghiệm đang xem: câu hỏi, câu trả lời (học sinh chỉ lấy của chính mình), ứng viên để thêm từ ngân hàng
  const quiz = tab === "bai-tap" && exercise?.quizMode ? exercise : undefined;
  const quizItems: QuizItem[] = quiz ? await db.exerciseQuestion.findMany({ where: { exerciseId: quiz.id }, orderBy: { order: "asc" }, include: { question: { include: { options: { orderBy: { order: "asc" } } } } } }) : [];
  const quizAnswers = quiz ? await db.studentAnswer.findMany({ where: { submission: { exerciseId: quiz.id, ...(student ? { studentId: me.studentId ?? "-" } : {}) } } }) : [];
  const violationRows = quiz?.secureMode ? await db.examViolation.findMany({ where: { exerciseId: quiz.id, ...(student ? { studentId: me.studentId ?? "-" } : {}) }, orderBy: { createdAt: "asc" } }) : [];
  const attemptRows = quiz && !student && quiz.maxAttempts > 1 ? await db.quizAttempt.findMany({ where: { exerciseId: quiz.id, submittedAt: { not: null } }, orderBy: { attemptNo: "asc" } }) : [];
  const attemptsOf = new Map<string, typeof attemptRows>();
  for (const a of attemptRows) (attemptsOf.get(a.studentId) ?? attemptsOf.set(a.studentId, []).get(a.studentId)!).push(a);
  const violationsOf = new Map<string, typeof violationRows>();
  for (const v of violationRows) (violationsOf.get(v.studentId) ?? violationsOf.set(v.studentId, []).get(v.studentId)!).push(v);
  const quizStats = new Map<string, { right: number; total: number }>();
  if (!student) for (const x of quizAnswers) { const c = quizStats.get(x.questionId) ?? { right: 0, total: 0 }; c.total++; if (x.isCorrect) c.right++; quizStats.set(x.questionId, c); }
  const quizCandidates = quiz && manage
    ? (await db.question.findMany({ where: { teacherId: a.teacherId, subjectId: a.subjectId, gradeLevelId: a.schoolClass.gradeLevelId, reviewStatus: "READY", archivedAt: null, parentId: null, id: { notIn: quizItems.map((i) => i.question.id) } }, include: { gradeLevel: { select: { gradeName: true } } }, orderBy: { createdAt: "desc" }, take: 300 }))
        .map((q) => ({ ...q, gradeName: q.gradeLevel?.gradeName ?? null, options: [] }))
    : [];

  const linkList = (urls: string[]) => <AttachmentLinks urls={urls} />;
  const radioCard = "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50";
  const exerciseFields = (e?: (typeof post.exercises)[number]) => (
    <div className="group/q flex flex-col gap-3">
      {!e && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={radioCard}><input type="radio" name="quizMode" value="0" defaultChecked className="mt-1" /><span><b>Tự luận</b><br /><span className="text-xs font-normal text-slate-500">Học sinh nộp bài viết hoặc tệp, giáo viên chấm điểm</span></span></label>
          <label className={radioCard}><input type="radio" name="quizMode" value="1" className="mt-1" /><span><b>Trắc nghiệm</b><br /><span className="text-xs font-normal text-slate-500">Chọn câu hỏi từ ngân hàng, hệ thống tự chấm điểm</span></span></label>
        </div>
      )}
      <Field label="Tiêu đề bài tập"><input name="title" defaultValue={e?.title} className={inputCls + " w-full"} required /></Field>
      <Field label="Đề bài / hướng dẫn làm bài"><textarea name="content" rows={4} defaultValue={e?.content} className={inputCls + " h-auto w-full py-2"} /></Field>
      <Field label="Hạn nộp"><input name="dueDate" type="date" defaultValue={e?.dueDate ? e.dueDate.toISOString().slice(0, 10) : ""} className={inputCls + " w-full"} /></Field>
      <div className={e?.quizMode ? "block" : e ? "hidden" : "hidden group-has-[input[name=quizMode][value='1']:checked]/q:block"}>
        <Field label="Khi nào học sinh được xem đáp án đúng (bài trắc nghiệm)">
          <select name="showAnswers" defaultValue={e?.showAnswers ?? "AFTER_DUE"} className={inputCls + " w-full"}>
            <option value="AFTER_DUE">Sau hạn nộp (không có hạn thì ngay sau khi nộp)</option>
            <option value="AFTER_SUBMIT">Ngay sau khi học sinh nộp bài</option>
            <option value="NEVER">Không công khai đáp án</option>
          </select>
        </Field>
      </div>
      {e ? (e.quizMode ? <><AttemptFields maxAttempts={e.maxAttempts} scoring={e.attemptScoring} timeLimit={e.timeLimitMinutes} allowReview={e.allowReview} /><ShuffleFields defaultQuestions={e.shuffleQuestions} defaultOptions={e.shuffleOptions} /><SecureModeFields defaultSecure={e.secureMode} defaultMax={e.maxViolations} /></> : null) : <div className="hidden space-y-3 group-has-[input[name=quizMode][value='1']:checked]/q:block"><AttemptFields /><ShuffleFields /><SecureModeFields /></div>}
      <div className="space-y-1 text-xs font-semibold"><p>Tệp đính kèm</p><AttachmentUpload purpose="EXERCISE" assignmentId={post.assignmentId} initialUrls={e ? linksOf(e.attachments) : []} /></div>
    </div>
  );

  const exerciseHeaderActions = exercise ? (
<div className="btn-row flex flex-wrap gap-2">
                  <DialogButton label="Sửa bài tập" title="Sửa bài tập" variant="secondary" size="sm">
                    <ActionForm action={updateExercise} submit="Lưu" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                      <input type="hidden" name="id" value={exercise.id} />
                      {exerciseFields(exercise)}
                    </ActionForm>
                  </DialogButton>
                  <ActionForm action={deleteExercise} submit="Xoá bài tập" compact danger confirmText="Xoá bài tập này cùng các bài nộp?" className="inline-flex"><input type="hidden" name="id" value={exercise.id} /></ActionForm>
                </div>
  ) : null;

  return (
    <div className="space-y-4">
      {!student && (isManager(me)
        ? <PageCrumbs items={[{ label: "Giảng dạy", href: "/giang-day" }, { label: a.subject.subjectName, href: `/giang-day?mon=${a.subjectId}` }, { label: gradeName, href: `/giang-day/${a.subjectId}/${a.schoolClass.gradeLevelId}` }, { label: a.schoolClass.className, href: `/giang-day/${a.subjectId}/${a.schoolClass.gradeLevelId}/${a.schoolClassId}` }, { label: post.title, href: exercise ? `/bai-hoc/${post.id}?tab=bai-tap` : undefined }, ...(exercise ? [{ label: exercise.title }] : [])]} />
        : <PageCrumbs items={[{ label: "Lớp của tôi", href: "/lop-cua-toi" }, { label: `${a.schoolClass.className} · ${a.subject.subjectName}`, href: `/lop-cua-toi/${a.id}?tab=posts` }, { label: post.title, href: exercise ? `/bai-hoc/${post.id}?tab=bai-tap` : undefined }, ...(exercise ? [{ label: exercise.title }] : [])]} />)}
      <Card mobile="flat" className="detail-header flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><BookOpen className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{post.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>{a.schoolClass.className} · {a.subject.subjectName} · {a.academicTerm.termName}</span>
            <span>GV: {a.teacher.fullName}</span>
            <span>{post.exercises.length} bài tập</span>
            <span className="flex items-center gap-1"><Eye className="size-4 text-slate-400" />{viewCount} lượt học sinh xem</span>
          </div>
        </div>
        <div className="btn-row flex flex-wrap gap-2">
          {manage && (
            <DialogButton label="Sửa bài học" title="Sửa bài học" variant="secondary">
              <ActionForm action={updatePost} submit="Lưu" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                <input type="hidden" name="id" value={post.id} />
                <Field label="Tiêu đề"><input name="title" defaultValue={post.title} className={inputCls + " w-full"} required /></Field>
                <Field label="Nội dung"><textarea name="content" rows={5} defaultValue={post.content} className={inputCls + " h-auto w-full py-2"} /></Field>
                <div className="space-y-1 text-xs font-semibold"><p>Tệp đính kèm</p><AttachmentUpload purpose="LESSON_POST" assignmentId={post.assignmentId} initialUrls={links} /></div>
              </ActionForm>
            </DialogButton>
          )}
          {manage && <ActionForm action={deletePost} submit="Xoá bài học" compact danger confirmText="Xoá bài học này cùng các bài tập, lượt xem và bài nộp?" className="inline-flex"><input type="hidden" name="id" value={post.id} /></ActionForm>}
        </div>
      </Card>

      <Tabs
        right={manage && tab === "bai-tap" && exercise ? exerciseHeaderActions : manage && tab === "bai-tap" ? (
          <div className="btn-row flex flex-wrap gap-2">
          <DialogButton label="Lấy từ kho bài tập" title="Lấy bài tập từ Ngân hàng bài học" variant="secondary" wide>
            {libExercises.length ? (
              <ActionForm action={publishExerciseToPostAction} submit="Thêm vào bài học" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                <input type="hidden" name="lessonPostId" value={post.id} />
                <div className="space-y-2">
                  {libExercises.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
                      <input type="radio" name="libraryExerciseId" value={e.id} required className="mt-1" />
                      <span><b>{e.title}</b>{e.kind === "REVIEW" && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">Ôn tập</span>}<br /><span className="text-xs text-slate-500">Bài {e.lesson.orderNo}. {e.lesson.title} · {e.quizMode ? `${e._count.questions} câu trắc nghiệm` : "Tự luận"}</span></span>
                    </label>
                  ))}
                </div>
                <Field label="Hạn nộp"><input name="dueDate" type="date" className={inputCls + " w-full"} /></Field>
              </ActionForm>
            ) : <p className="text-sm text-slate-600">Chưa có bài tập mẫu phù hợp (cùng môn, cùng khối, chưa đăng vào bài học này). Tạo bài tập ở <Link href="/ngan-hang-bai-hoc" className="font-medium text-orange-700 hover:underline">Ngân hàng bài học</Link>.</p>}
          </DialogButton>
          <DialogButton label="+ Thêm bài tập" title={`Thêm bài tập · ${post.title}`}>
            <ActionForm action={createExercise} submit="Thêm bài tập" className="flex flex-col gap-3 [&>button]:self-start">
              <input type="hidden" name="lessonPostId" value={post.id} />
              {exerciseFields()}
              <p className="text-xs text-slate-500">Bài trắc nghiệm: sau khi tạo, bạn chọn câu hỏi từ Ngân hàng câu hỏi của mình (cùng môn với bài học).</p>
            </ActionForm>
          </DialogButton>
          </div>
        ) : undefined}
        current={tabHref(tab)} items={TABS.map(([k, l]) => [tabHref(k), l] as [string, string])}
      />

      {tab === "content" && (
        <Card>
          <p className="whitespace-pre-line text-sm text-slate-700">{post.content}</p>
          {linkList(links)}
        </Card>
      )}

      {/* ===================== BÀI TẬP CỦA BÀI HỌC ===================== */}
      {tab === "bai-tap" && !exercise && (
        <div className="space-y-3">
          <Table head={student ? ["Bài tập", "Hạn nộp", "Trạng thái"] : ["Bài tập", "Hạn nộp", "Đã nộp", "Đã chấm"]}>
            {post.exercises.map((e) => {
              const mine = me.studentId ? e.submissions.find((s) => s.studentId === me.studentId) : undefined;
              const late = !!e.dueDate && e.dueDate < today && !mine;
              return (
                <tr key={e.id} className="align-middle [&>td]:!py-3">
                  <td className="min-w-48"><Link data-row href={`?tab=bai-tap&ex=${e.id}`} className="font-semibold text-orange-700 hover:underline">{e.title}</Link>{e.quizMode && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">Trắc nghiệm · {e._count.questions} câu</span>}</td>
                  <td>{e.dueDate ? <span className={late ? "font-medium text-red-600" : ""}>{fmtDate(e.dueDate)}</span> : <span className="text-slate-400">Không có hạn</span>}</td>
                  {student ? (
                    <td>{mine ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">{mine.grade != null ? `Đã chấm · ${mine.grade}` : "Đã nộp"}</span> : <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">Chưa nộp</span>}</td>
                  ) : (
                    <>
                      <td><b>{e._count.submissions}</b>/{a.schoolClass._count.enrollments}</td>
                      <td><b>{gradedOf.get(e.id) ?? 0}</b>/{e._count.submissions}</td>
                    </>
                  )}
                </tr>
              );
            })}
            {!post.exercises.length && <tr><td colSpan={student ? 3 : 4} className="py-8 text-center text-slate-500">{manage ? 'Bài học này chưa có bài tập. Bấm "+ Thêm bài tập".' : "Bài học này chưa có bài tập."}</td></tr>}
          </Table>
        </div>
      )}

      {tab === "bai-tap" && exercise && (() => {
        const subs = exercise.submissions;
        const subOf = new Map(subs.map((s) => [s.studentId, s]));
        const mine = me.studentId ? subOf.get(me.studentId) : undefined;
        const late = !!exercise.dueDate && exercise.dueDate < today;
        return (
          <div className="space-y-3">
            {student && <Link href="?tab=bai-tap" className="inline-block text-sm text-slate-500 hover:text-orange-700">‹ Bài tập của bài học</Link>}
            <Card>
              <h2 className="text-lg font-semibold">{exercise.title}</h2>
              {exercise.quizMode && !student && (exercise.shuffleQuestions || exercise.shuffleOptions || exercise.secureMode || (attemptState?.max ?? exercise.maxAttempts) > 1 || exercise.timeLimitMinutes > 0 || !exercise.allowReview) && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(attemptState?.max ?? exercise.maxAttempts) > 1 && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">{exercise.maxAttempts} lượt · {SCORING_LABEL[exercise.attemptScoring].toLowerCase()}</span>}
                  {exercise.timeLimitMinutes > 0 && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">{exercise.timeLimitMinutes} phút</span>}
                  {!exercise.allowReview && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Không cho xem lại bài</span>}
                  {exercise.shuffleQuestions && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Xáo câu hỏi</span>}
                  {exercise.shuffleOptions && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Xáo đáp án</span>}
                  {exercise.secureMode && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Thi nghiêm túc{exercise.maxViolations ? ` · tự nộp sau ${exercise.maxViolations} vi phạm` : ""}</span>}
                </div>
              )}
              <div className="mt-1 text-xs text-slate-500">{exercise.dueDate ? <span className={late ? "font-medium text-red-600" : ""}>Hạn nộp {fmtDate(exercise.dueDate)}</span> : "Không có hạn nộp"}</div>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{exercise.content}</p>
              {linkList(linksOf(exercise.attachments))}
            </Card>

            {exercise.quizMode && (() => {
              const left = attemptState?.left ?? 0;
              const reveal = canRevealKey(exercise, !!mine, left);
              const retry = sp.retry === "1" && left > 0;
              const showForm = quizItems.length > 0 && (!mine || retry || !!attemptState?.active);
              const formAttemptNo = attemptState ? (attemptState.active?.attemptNo ?? attemptState.used + 1) : 1;
              const gated = exercise.secureMode || exercise.timeLimitMinutes > 0;
              // lượt nộp đúng lúc hết giờ (máy tự nộp): nộp sau >= thời lượng cho phép (trừ vài giây)
              const timedOut = (h: { startedAt: Date; submittedAt: Date | null }) => exercise.timeLimitMinutes > 0 && !!h.submittedAt && h.submittedAt.getTime() - h.startedAt.getTime() >= exercise.timeLimitMinutes * 60_000 - 4000;
              const lastAttempt = attemptState?.history.at(-1);
              // xáo trộn đề theo từng học sinh (cố định theo học sinh nên tải lại trang vẫn thấy đúng thứ tự của mình)
              const flags = { questions: exercise.shuffleQuestions, options: exercise.shuffleOptions };
              const mineItems = student ? arrangeForStudent(quizItems, flags, shuffleSeedFor(exercise.id, me.studentId ?? "-", showForm ? formAttemptNo : (mine?.attemptNo ?? 1))) : quizItems;
              return (
                <>
                  {manage && <QuizManage items={quizItems} exerciseId={exercise.id} locked={subs.length > 0} stats={quizStats} candidates={quizCandidates} />}
                  {student && (
                    <Card mobile="flat">
                      {mine && !showForm ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold">Kết quả của tôi</h2>
                            <span className="rounded-full bg-green-100 px-3 py-0.5 text-sm font-bold text-green-800">{fmtPts(mine.grade ?? 0)}/10</span>
                            <span className="text-xs text-slate-500">Nộp lúc {fmtTime(mine.submittedAt)}</span>
                            {mine.isLate && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Nộp muộn</span>}
                            {mine.autoSubmitted && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Nộp tự động do vi phạm</span>}
                            {violationRows.length > 0 && <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">{violationRows.length} vi phạm</span>}
                          </div>
                          {lastAttempt && timedOut(lastAttempt) && !mine.autoSubmitted && (
                            <div role="alert" className="rounded-lg border-2 border-slate-500 bg-slate-100 p-4 text-sm text-slate-800">
                              <b className="text-base">Hết giờ làm bài.</b> Bài của em đã được nộp tự động khi đồng hồ về 0 ({exercise.timeLimitMinutes} phút). Các câu chưa làm được tính 0 điểm.
                            </div>
                          )}
                          {mine.autoSubmitted && (
                            <div role="alert" className="rounded-lg border-2 border-red-500 bg-red-50 p-4 text-sm text-red-800">
                              <b className="text-base">Bài của em đã bị nộp tự động do vi phạm quy chế thi.</b>
                              <p className="mt-1">Em đã vi phạm {violationRows.length}{exercise.maxViolations ? `/${exercise.maxViolations}` : ""} lần nên hệ thống nộp bài làm tại thời điểm đó. Các câu chưa làm được tính 0 điểm. Giáo viên đã được thông báo.</p>
                              <ul className="mt-2 space-y-0.5 text-xs">{violationRows.map((v) => <li key={v.id}>{fmtTime(v.createdAt)} · {VIOLATION_LABEL[v.type] ?? v.type}</li>)}</ul>
                            </div>
                          )}
                          {attemptState && (attemptState?.max ?? exercise.maxAttempts) > 1 && (
                            <div className="rounded-md border p-3 text-sm">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><b>Các lượt làm ({attemptState.used}/{attemptState.max})</b><span className="text-xs text-slate-500">{SCORING_LABEL[exercise.attemptScoring]}</span></div>
                              <ul className="space-y-1">{attemptState.history.map((h) => (
                                <li key={h.id} className="flex flex-wrap items-center gap-2 text-xs"><span className="w-14 font-medium">Lượt {h.attemptNo}</span><b>{fmtPts(h.grade ?? 0)}/10</b><span className="text-slate-500">{h.submittedAt ? fmtTime(h.submittedAt) : ""}</span>
                                  {h.attemptNo === mine.attemptNo && <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-800">Đang được tính</span>}
                                  {h.overtime && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">Quá giờ</span>}
                                  {!h.overtime && timedOut(h) && <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">Hết giờ tự nộp</span>}
                                  {h.autoSubmitted && !h.overtime && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">Tự nộp</span>}</li>
                              ))}</ul>
                              {left > 0 && <Link href={`?tab=bai-tap&ex=${exercise.id}&retry=1`} className="mt-3 inline-flex h-9 items-center rounded-md bg-coral-600 px-4 text-sm font-medium text-white hover:bg-coral-700">Làm lại (còn {left} lượt)</Link>}
                            </div>
                          )}
                          {!exercise.allowReview ? (
                            <p className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">Giáo viên không cho xem lại bài làm của bài này. Em chỉ xem được điểm.</p>
                          ) : (
                            <>
                              {!reveal && <p className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">{exercise.showAnswers === "NEVER" ? "Giáo viên không công khai đáp án đúng của bài này." : left > 0 ? "Đáp án đúng sẽ hiện khi em dùng hết lượt làm bài." : exercise.dueDate ? `Đáp án đúng sẽ hiện sau hạn nộp (${fmtDate(exercise.dueDate)}).` : "Đáp án đúng chưa được công khai."}</p>}
                              <QuizReview items={mineItems} answers={quizAnswers} reveal={reveal} />
                            </>
                          )}
                        </div>
                      ) : quizItems.length ? (
                        gated ? (
                          <>
                            {late && <p className="mb-3 text-xs text-red-600">Đã quá hạn nộp ({fmtDate(exercise.dueDate)}). Bài nộp sẽ được gắn nhãn Nộp muộn.</p>}
                            <ExamRunner exerciseId={exercise.id} title={exercise.title} count={quizItems.length} secure={exercise.secureMode} maxViolations={exercise.maxViolations} priorViolations={violationRows.length} timeLimitMinutes={exercise.timeLimitMinutes} attemptNo={formAttemptNo} maxAttempts={attemptState?.max ?? exercise.maxAttempts} report={reportViolation} start={startAttempt} action={submitQuizWork}>
                              <QuizTake items={mineItems} />
                            </ExamRunner>
                          </>
                        ) : (
                        <ActionForm action={submitQuizWork} submit="Nộp bài" confirmText={(attemptState?.max ?? exercise.maxAttempts) > 1 ? "Nộp bài? Nộp xong lượt này không sửa được." : "Nộp bài? Em chỉ được làm bài một lần."} reset={false} className="flex flex-col gap-4 [&>button]:self-start">
                          <input type="hidden" name="exerciseId" value={exercise.id} />
                          <h2 className="font-semibold">Làm bài ({quizItems.length} câu)</h2>
                          <QuizTake items={mineItems} />
                          {late && <p className="text-xs text-red-600">Đã quá hạn nộp ({fmtDate(exercise.dueDate)}). Bài nộp sẽ được gắn nhãn Nộp muộn.</p>}
                        </ActionForm>
                        )
                      ) : <p className="py-6 text-center text-sm text-slate-500">Giáo viên chưa thêm câu hỏi vào bài tập này.</p>}
                    </Card>
                  )}
                  {!student && (
                    <>
                      <Card className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                        <span><b>{subs.length}</b>/{a.schoolClass._count.enrollments} học sinh đã nộp</span>
                        {subs.length > 0 && <span>Điểm trung bình: <b>{fmtPts(subs.reduce((t, x) => t + (x.grade ?? 0), 0) / subs.length)}</b></span>}
                      </Card>
                      <Table head={["Học sinh", "Trạng thái", "Nộp lúc", "Điểm", ...((attemptState?.max ?? exercise.maxAttempts) > 1 ? ["Số lần"] : []), ...(exercise.secureMode ? ["Vi phạm"] : []), ""]}>
                        {roster.map((s) => {
                          const sub = subOf.get(s.id);
                          return (
                            <tr key={s.id} className="align-middle [&>td]:!py-3">
                              <td><Link data-row href={`/hoc-sinh/${s.id}`} className="font-semibold hover:text-orange-700">{s.fullName}</Link><div className="text-xs text-slate-500">{s.code}</div></td>
                              <td>{sub ? <div className="flex flex-col gap-0.5"><span className="inline-flex w-fit rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Đã nộp</span>{sub.isLate && <span className="inline-flex w-fit rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Nộp muộn</span>}</div> : <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">Chưa nộp</span>}</td>
                              <td>{sub ? fmtTime(sub.submittedAt) : <span className="text-slate-400">-</span>}</td>
                              <td>{sub?.grade != null ? <b>{fmtPts(sub.grade)}</b> : <span className="text-slate-400">-</span>}</td>
                              {(attemptState?.max ?? exercise.maxAttempts) > 1 && <td>{attemptsOf.get(s.id)?.length ?? (sub ? 1 : 0)}/{exercise.maxAttempts}</td>}
                              {exercise.secureMode && <td>{(violationsOf.get(s.id)?.length ?? 0) > 0 ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{violationsOf.get(s.id)!.length}{sub?.autoSubmitted ? " · tự nộp" : ""}</span> : <span className="text-slate-400">0</span>}</td>}
                              <td>{sub && manage && (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <DialogButton label="Xem bài làm" title={`Bài làm · ${s.fullName} · ${fmtPts(sub.grade ?? 0)}/10`} size="sm" variant="secondary" wide>
                                    {(violationsOf.get(s.id)?.length ?? 0) > 0 && (
                                      <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                                        <b className="text-red-700">{violationsOf.get(s.id)!.length} vi phạm{sub.autoSubmitted ? " · bài bị nộp tự động" : ""}</b>
                                        <ul className="mt-1 space-y-0.5 text-xs text-red-800">{violationsOf.get(s.id)!.map((v) => <li key={v.id}>{fmtTime(v.createdAt)} · {VIOLATION_LABEL[v.type] ?? v.type}</li>)}</ul>
                                      </div>
                                    )}
                                    {(attemptsOf.get(s.id)?.length ?? 0) > 0 && (
                                      <div className="mb-3 rounded-md border p-3 text-sm">
                                        <b>Các lượt làm ({attemptsOf.get(s.id)!.length}/{exercise.maxAttempts}) · {SCORING_LABEL[exercise.attemptScoring]}</b>
                                        <ul className="mt-1 space-y-0.5 text-xs">{attemptsOf.get(s.id)!.map((h) => <li key={h.id}>Lượt {h.attemptNo}: <b>{fmtPts(h.grade ?? 0)}/10</b> · {h.submittedAt ? fmtTime(h.submittedAt) : ""}{h.attemptNo === sub.attemptNo ? " · đang được tính" : ""}{h.overtime ? " · quá giờ" : ""}{h.autoSubmitted && !h.overtime ? " · tự nộp" : ""}</li>)}</ul>
                                      </div>
                                    )}
                                    <QuizReview items={arrangeForStudent(quizItems, flags, shuffleSeedFor(exercise.id, s.id, sub.attemptNo))} answers={quizAnswers.filter((x) => x.submissionId === sub.id)} reveal />
                                  </DialogButton>
                                  <ActionForm action={resetQuiz} submit="Cho làm lại" compact danger confirmText={`Cấp thêm một lượt làm cho ${s.fullName}, giữ nguyên lịch sử?`} className="inline-flex"><input type="hidden" name="submissionId" value={sub.id} /></ActionForm>
                                </div>
                              )}</td>
                            </tr>
                          );
                        })}
                        {!a.schoolClass._count.enrollments && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
                      </Table>
                    </>
                  )}
                </>
              );
            })()}

            {student && !exercise.quizMode && (
              <Card mobile="flat">
                <h2 className="mb-3 font-semibold">Bài làm của tôi</h2>
                {mine ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Đã nộp lúc {fmtTime(mine.submittedAt)}</span>
                      {mine.isLate && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Nộp muộn</span>}
                      {mine.resubmittedCount > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Đã cập nhật ({mine.resubmittedCount} lần)</span>}
                    </div>
                    <p className="whitespace-pre-line rounded-md bg-slate-50 p-3">{mine.content}</p><AttachmentLinks urls={linksOf(mine.attachments)} />
                    {mine.grade != null ? (
                      <div className="rounded-md border border-green-300 bg-green-50 p-3">
                        <b className="text-green-800">Điểm: {mine.grade}</b>
                        {mine.feedback && <p className="mt-1 whitespace-pre-line text-slate-700">{mine.feedback}</p>}
                      </div>
                    ) : (
                      <div className="mt-4 border-t pt-3">
                        <div className="mb-2 text-xs text-slate-600">Giáo viên chưa chấm bài. Bạn có thể cập nhật lại bài làm nếu cần sửa đổi:</div>
                        <ActionForm action={submitWork} submit="Cập nhật bài làm" className="flex flex-col gap-3 [&>button]:self-start">
                          <input type="hidden" name="exerciseId" value={exercise.id} />
                          <AttachmentUpload purpose="SUBMISSION" assignmentId={post.assignmentId} exerciseId={exercise.id} initialUrls={mine ? linksOf(mine.attachments) : []} />
                          <Field label="Bài làm cập nhật">
                            <textarea name="content" defaultValue={mine.content ?? ""} rows={6} className={inputCls + " h-auto w-full py-2"} placeholder="Nhập bài làm của em..." />
                          </Field>
                          {late && <p className="text-xs text-red-600">Lưu ý: Đã quá hạn nộp ({fmtDate(exercise.dueDate)}). Lần cập nhật này sẽ được đánh dấu Nộp muộn.</p>}
                        </ActionForm>
                      </div>
                    )}
                  </div>
                ) : (
                  <ActionForm action={submitWork} submit="Nộp bài" className="flex flex-col gap-3 [&>button]:self-start">
                    <input type="hidden" name="exerciseId" value={exercise.id} />
                          <AttachmentUpload purpose="SUBMISSION" assignmentId={post.assignmentId} exerciseId={exercise.id} initialUrls={[]} />
                    <Field label="Bài làm"><textarea name="content" rows={6} className={inputCls + " h-auto w-full py-2"} placeholder="Nhập bài làm của em..." /></Field>
                    {late && <p className="text-xs text-red-600">Đã quá hạn nộp ({fmtDate(exercise.dueDate)}). Bài nộp sẽ được gắn nhãn Nộp muộn.</p>}
                  </ActionForm>
                )}
              </Card>
            )}

            {!student && !exercise.quizMode && (
              <div className="[&_table]:table-fixed [&_th:nth-child(1)]:w-[26%] [&_th:nth-child(2)]:w-[13%] [&_th:nth-child(3)]:w-[16%] [&_th:nth-child(4)]:w-[25%] [&_th:nth-child(5)]:w-[8%] [&_th:last-child]:text-right [&_td:last-child]:text-right">
                <Table head={["Học sinh", "Trạng thái", "Nộp lúc", "Bài làm", "Điểm", ""]}>
                  {roster.map((s) => {
                    const sub = subOf.get(s.id);
                    return (
                      <tr key={s.id} className="align-middle [&>td]:!py-3">
                        <td><Link data-row href={`/hoc-sinh/${s.id}`} className="font-semibold hover:text-orange-700">{s.fullName}</Link><div className="text-xs text-slate-500">{s.code}</div></td>
                        <td>
                          {sub ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex w-fit rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Đã nộp</span>
                              {sub.isLate && <span className="inline-flex w-fit rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Nộp muộn</span>}
                              {sub.resubmittedCount > 0 && <span className="text-[10px] text-slate-500">Sửa {sub.resubmittedCount} lần</span>}
                            </div>
                          ) : (
                            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">Chưa nộp</span>
                          )}
                        </td>
                        <td>{sub ? fmtTime(sub.submittedAt) : <span className="text-slate-400">-</span>}</td>
                        <td><span className="line-clamp-2 text-sm text-slate-600">{sub?.content ?? "-"}</span>{sub && <AttachmentLinks urls={linksOf(sub.attachments)} />}</td>
                        <td>{sub?.grade != null ? <b>{sub.grade}</b> : <span className="text-slate-400">-</span>}</td>
                        <td>{sub && manage && (
                          <DialogButton label={sub.grade != null ? "Chấm lại" : "Chấm điểm"} title={`Chấm bài · ${s.fullName}`} size="sm" variant="secondary">
                            <p className="mb-3 whitespace-pre-line rounded-md bg-slate-50 p-3 text-sm">{sub.content}</p><AttachmentLinks urls={linksOf(sub.attachments)} />
                            <ActionForm action={gradeWork} submit="Lưu điểm" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                              <input type="hidden" name="submissionId" value={sub.id} />
                              <Field label="Điểm (0–10)"><input name="grade" defaultValue={sub.grade ?? ""} inputMode="decimal" className={inputCls + " w-full"} required /></Field>
                              <Field label="Nhận xét"><textarea name="feedback" rows={3} defaultValue={sub.feedback ?? ""} className={inputCls + " h-auto w-full py-2"} /></Field>
                            </ActionForm>
                          </DialogButton>
                        )}</td>
                      </tr>
                    );
                  })}
                  {!a.schoolClass._count.enrollments && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
                </Table>
              </div>
            )}
          </div>
        );
      })()}

      {tab === "views" && !student && (
        <div className="space-y-3">
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span><b>{viewCount}</b>/{a.schoolClass._count.enrollments} học sinh đã xem</span>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${a.schoolClass._count.enrollments ? (viewCount / a.schoolClass._count.enrollments) * 100 : 0}%`, background: "var(--color-orange-500)" }} /></div>
          </Card>
          <Table head={["Học sinh", "Trạng thái", "Xem lúc"]}>
            {roster.map((s) => {
              const v = viewOf.get(s.id);
              return (
                <tr key={s.id} className="align-middle [&>td]:!py-3">
                  <td><Link data-row href={`/hoc-sinh/${s.id}`} className="font-semibold hover:text-orange-700">{s.fullName}</Link><div className="text-xs text-slate-500">{s.code}</div></td>
                  <td>{v ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Đã xem</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Chưa xem</span>}</td>
                  <td>{v ? fmtTime(v.viewedAt) : <span className="text-slate-400">-</span>}</td>
                </tr>
              );
            })}
            {!a.schoolClass._count.enrollments && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
          </Table>
        </div>
      )}
    </div>
  );
}
