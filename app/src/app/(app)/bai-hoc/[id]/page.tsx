import { AttachmentLinks } from "@/components/attachment-links";
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
import { assignmentWhere, isStudentOnly } from "@/server/learning-scope";
import { createExercise, deleteExercise, deletePost, gradeWork, submitWork, updateExercise, updatePost } from "../actions";

const fmtTime = (d: Date) => `${fmtDate(d)} ${new Date(d.getTime() + 7 * 3600_000).toISOString().slice(11, 16)}`;
const linksOf = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

export default async function LessonPostDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ex?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES, "STUDENT");
  const { id } = await params;
  const sp = await searchParams;
  const student = isStudentOnly(me);

  const post = await db.lessonPost.findFirst({
    where: { id, assignment: assignmentWhere(me) },
    include: {
      assignment: { include: { schoolClass: { include: { enrollments: { include: { student: true } } } }, subject: true, academicTerm: true, teacher: true } },
      exercises: { orderBy: { createdAt: "asc" }, include: { submissions: true } },
    },
  });
  if (!post) notFound();
  const a = post.assignment;
  const manage = !student && (await canManageClassSubjectAssignment(me, a.id));

  // học sinh mở bài = ghi nhận "đã xem" theo từng người (không chỉ đếm lượt)
  if (student) await viewLessonPost(me, id).catch(() => null);

  const seen = new Set<string>();
  const roster = a.schoolClass.enrollments.filter((e) => !seen.has(e.studentId) && seen.add(e.studentId)).map((e) => e.student).sort((x, y) => x.fullName.localeCompare(y.fullName, "vi"));
  const views = await db.lessonPostView.findMany({ where: { lessonPostId: id } });
  const viewOf = new Map(views.map((v) => [v.studentId, v]));
  const links = linksOf(post.attachments);
  const today = todayUTC();

  const TABS: [string, string][] = [
    ["content", "Nội dung"],
    ["bai-tap", `Bài tập (${post.exercises.length})`],
    ...(student ? [] : [["views", `Ai đã xem (${views.length}/${roster.length})`] as [string, string]]),
  ];
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "content";
  const exercise = post.exercises.find((e) => e.id === sp.ex);
  const tabHref = (k: string) => `?tab=${k}`;

  const linkList = (urls: string[]) => <AttachmentLinks urls={urls} />;
  const exerciseFields = (e?: (typeof post.exercises)[number]) => (
    <>
      <Field label="Tiêu đề bài tập"><input name="title" defaultValue={e?.title} className={inputCls + " w-full"} required /></Field>
      <Field label="Đề bài"><textarea name="content" rows={5} defaultValue={e?.content} className={inputCls + " h-auto w-full py-2"} /></Field>
      <Field label="Hạn nộp"><input name="dueDate" type="date" defaultValue={e?.dueDate ? e.dueDate.toISOString().slice(0, 10) : ""} className={inputCls + " w-full"} /></Field>
      <div className="space-y-1 text-xs font-semibold"><p>Tệp đính kèm</p><AttachmentUpload purpose="EXERCISE" assignmentId={post.assignmentId} initialUrls={e ? linksOf(e.attachments) : []} /></div>
    </>
  );

  return (
    <div className="space-y-4">
      <Card mobile="flat" className="flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><BookOpen className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{post.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>{a.schoolClass.className} · {a.subject.subjectName} · {a.academicTerm.termName}</span>
            <span>GV: {a.teacher.fullName}</span>
            <span>{post.exercises.length} bài tập</span>
            <span className="flex items-center gap-1"><Eye className="size-4 text-slate-400" />{views.length} lượt học sinh xem</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
        right={manage && tab === "bai-tap" && !exercise ? (
          <DialogButton label="+ Thêm bài tập" title={`Thêm bài tập · ${post.title}`}>
            <ActionForm action={createExercise} submit="Thêm bài tập" className="flex flex-col gap-3 [&>button]:self-start">
              <input type="hidden" name="lessonPostId" value={post.id} />
              {exerciseFields()}
              <p className="text-xs text-slate-500">Hiện bài tập nộp dạng tự luận (văn bản). Trắc nghiệm tự chấm sẽ được tích hợp ngay trong bài tập ở bước sau.</p>
            </ActionForm>
          </DialogButton>
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
                  <td className="min-w-48"><Link data-row href={`?tab=bai-tap&ex=${e.id}`} className="font-semibold text-orange-700 hover:underline">{e.title}</Link></td>
                  <td>{e.dueDate ? <span className={late ? "font-medium text-red-600" : ""}>{fmtDate(e.dueDate)}</span> : <span className="text-slate-400">Không có hạn</span>}</td>
                  {student ? (
                    <td>{mine ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">{mine.grade != null ? `Đã chấm · ${mine.grade}` : "Đã nộp"}</span> : <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">Chưa nộp</span>}</td>
                  ) : (
                    <>
                      <td><b>{e.submissions.length}</b>/{roster.length}</td>
                      <td><b>{e.submissions.filter((s) => s.grade != null).length}</b>/{e.submissions.length}</td>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href="?tab=bai-tap" className="text-sm text-slate-500 hover:text-orange-700">Bài tập của bài học</Link>
              {manage && (
                <div className="flex flex-wrap gap-2">
                  <DialogButton label="Sửa bài tập" title="Sửa bài tập" variant="secondary" size="sm">
                    <ActionForm action={updateExercise} submit="Lưu" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                      <input type="hidden" name="id" value={exercise.id} />
                      {exerciseFields(exercise)}
                    </ActionForm>
                  </DialogButton>
                  <ActionForm action={deleteExercise} submit="Xoá bài tập" compact danger confirmText="Xoá bài tập này cùng các bài nộp?" className="inline-flex"><input type="hidden" name="id" value={exercise.id} /></ActionForm>
                </div>
              )}
            </div>
            <Card>
              <h2 className="text-lg font-semibold">{exercise.title}</h2>
              <div className="mt-1 text-xs text-slate-500">{exercise.dueDate ? <span className={late ? "font-medium text-red-600" : ""}>Hạn nộp {fmtDate(exercise.dueDate)}</span> : "Không có hạn nộp"}</div>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{exercise.content}</p>
              {linkList(linksOf(exercise.attachments))}
            </Card>

            {student && (
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

            {!student && (
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
                  {!roster.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
                </Table>
              </div>
            )}
          </div>
        );
      })()}

      {tab === "views" && !student && (
        <div className="space-y-3">
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span><b>{views.length}</b>/{roster.length} học sinh đã xem</span>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${roster.length ? (views.length / roster.length) * 100 : 0}%`, background: "var(--color-orange-500)" }} /></div>
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
            {!roster.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
          </Table>
        </div>
      )}
    </div>
  );
}
