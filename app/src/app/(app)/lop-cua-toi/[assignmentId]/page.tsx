import { AttachmentUpload } from "@/components/attachment-upload";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GraduationCap, PenLine, ScrollText } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls, Table, Tabs } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { bandOf } from "@/server/grades-stats";
import { getPolicy } from "@/lib/policy";
import { ratingText } from "@/lib/policy-schema";
import { createPost } from "../../bai-hoc/actions";
import { PublishFromLibrary } from "@/components/publish-from-library";
import { MobileCards } from "@/components/mobile-cards";

const TABS = [["posts", "Bài học"], ["students", "Học sinh"], ["scores", "Điểm"], ["diary", "Sổ đầu bài"]] as const;
const DAY = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export default async function MyClass({ params, searchParams }: { params: Promise<{ assignmentId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const me = await requireRole(...TEACHING_ROLES, ...MANAGER_ROLES);
  const { assignmentId } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "posts"; // Bài học là tab mặc định
  const ratings = tab === "diary" ? (await getPolicy()).diaryRatings : [];
  const when = <T,>(on: boolean, q: () => Promise<T>, empty: T) => (on ? q() : Promise.resolve(empty));
  const [allowed, a, posts, postCount, exerciseCount, entries, averages, views, submissions, logs] = await Promise.all([
    canManageClassSubjectAssignment(me, assignmentId),
    db.classSubjectAssignment.findUnique({ where: { id: assignmentId }, include: { subject: true, teacher: true, academicTerm: { include: { academicYear: true } }, schoolClass: { include: { gradeLevel: true, enrollments: { include: { student: true } } } } }, }),
    when(tab === "posts", () => db.lessonPost.findMany({ where: { assignmentId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { views: true, exercises: true } }, exercises: { select: { _count: { select: { submissions: true } } } } } }), []),
    when(tab !== "posts", () => db.lessonPost.count({ where: { assignmentId } }), 0),
    when(tab === "students", () => db.exercise.count({ where: { lessonPost: { assignmentId } } }), 0),
    when(tab === "scores", () => db.scoreEntry.findMany({ where: { assignmentId }, orderBy: { createdAt: "asc" } }), []),
    when(tab === "students" || tab === "scores", () => db.subjectTermAverage.findMany({ where: { assignmentId } }), []),
    when(tab === "students", () => db.lessonPostView.groupBy({ by: ["studentId"], where: { lessonPost: { assignmentId } }, _count: { _all: true } }), []),
    when(tab === "students", () => db.assignmentSubmission.groupBy({ by: ["studentId"], where: { exercise: { lessonPost: { assignmentId } } }, _count: { _all: true } }), []),
    when(tab === "diary", () => db.classPeriodLog.findMany({ where: { timetableSlot: { assignmentId } }, orderBy: { logDate: "desc" }, take: 30, include: { timetableSlot: true } }), []),
  ]);
  if (!allowed || !a) notFound();

  const seen = new Set<string>();
  const roster = a.schoolClass.enrollments.filter((e) => !seen.has(e.studentId) && seen.add(e.studentId)).map((e) => e.student).sort((x, y) => x.fullName.localeCompare(y.fullName, "vi"));
  const library = tab === "posts" && me.teacherId ? await db.libraryLesson.findMany({ where: { teacherId: me.teacherId, subjectId: a.subjectId, gradeLevelId: a.schoolClass.gradeLevelId, archivedAt: null }, orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }], include: { exercises: { where: { archivedAt: null }, orderBy: { orderNo: "asc" }, include: { _count: { select: { questions: true } } } } } }) : [];
  const avgOf = new Map(averages.map((x) => [x.studentId, x.averageValue]));
  const viewed = new Map(views.map((v) => [v.studentId, v._count._all]));
  const submitted = new Map(submissions.map((v) => [v.studentId, v._count._all]));
  const nAssign = tab === "posts" ? posts.reduce((n, p) => n + p._count.exercises, 0) : exerciseCount;
  const entryOf = (sid: string) => entries.filter((e) => e.studentId === sid);

  const postActions = (
    <div className="btn-row flex flex-wrap gap-2">
            {me.teacherId && <PublishFromLibrary className={a.schoolClass.className} subjectName={a.subject.subjectName} gradeName={a.schoolClass.gradeLevel.gradeName} assignments={[{ id: a.id, label: `${a.academicTerm.termName} · ${a.academicTerm.academicYear.yearName}` }]} library={library} publishedLessonIds={posts.map((p) => p.sourceLessonId).filter((x): x is string => !!x)} />}
            <DialogButton label="+ Đăng bài học mới" title={`Đăng bài học · ${a.schoolClass.className} · ${a.subject.subjectName}`}>
              <ActionForm action={createPost} submit="Đăng bài" className="flex flex-col gap-3 [&>button]:self-start">
                <input type="hidden" name="assignmentId" value={a.id} />
                <Field label="Tiêu đề"><input name="title" className={inputCls + " w-full"} required /></Field>
                <Field label="Nội dung"><textarea name="content" rows={5} className={inputCls + " h-auto w-full py-2"} /></Field>
                <div className="space-y-1 text-xs font-semibold"><p>Tệp đính kèm</p><AttachmentUpload purpose="LESSON_POST" /></div>
              </ActionForm>
            </DialogButton>
    </div>
  );
  const tabsRight = tab === "posts" ? postActions : tab === "scores" ? <Link href={`/nhap-diem/${a.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700"><PenLine className="size-4" />Nhập / sửa điểm</Link> : undefined;

  return (
    <div className="space-y-4">
      <Card className="detail-header flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><GraduationCap className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{a.schoolClass.className} · {a.subject.subjectName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>{a.schoolClass.gradeLevel.gradeName}</span>
            <span>{a.academicTerm.termName} · {a.academicTerm.academicYear.yearName}</span>
            <span>GV: {a.teacher.fullName}</span>
            <span>{roster.length} học sinh</span>
          </div>
        </div>
        <div className="btn-row flex flex-wrap gap-2">
          <Link href={`/nhap-diem/${a.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700"><PenLine className="size-4" />Nhập điểm</Link>
          <Link href={`/so-dau-bai?classId=${a.schoolClassId}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-sm hover:bg-slate-50"><ScrollText className="size-4" />Sổ đầu bài</Link>
        </div>
      </Card>
      <Tabs right={tabsRight} current={`?tab=${tab}`} items={TABS.map(([k, l]) => [`?tab=${k}`, k === "students" ? `${l} (${roster.length})` : k === "posts" ? `${l} (${tab === "posts" ? posts.length : postCount})` : l] as [string, string])} />

      {tab === "students" && (
        <Table head={["Học sinh", "Phụ huynh", "Đã xem bài", "Bài tập đã nộp", "Điểm TB môn"]}>
          {roster.map((s) => {
            const avg = avgOf.get(s.id);
            const band = avg != null ? bandOf(avg) : null;
            return (
              <tr key={s.id} className="align-middle [&>td]:!py-3">
                <td><Link data-row href={`/hoc-sinh/${s.id}`} className="font-semibold text-orange-700 hover:underline">{s.fullName}</Link><div className="text-xs text-slate-500">{s.code}</div></td>
                <td>{s.guardianName ? <>{s.guardianName}<div className="text-xs text-slate-500">{s.guardianPhone}</div></> : "-"}</td>
                <td className="whitespace-nowrap">{viewed.get(s.id) ?? 0}/{posts.length}</td>
                <td className="whitespace-nowrap">{submitted.get(s.id) ?? 0}/{nAssign}</td>
                <td>{band ? <span className="font-semibold" style={{ color: band.color }}>{avg!.toFixed(2)} <span className="text-xs font-normal text-slate-500">· {band.label}</span></span> : <span className="text-slate-400">—</span>}</td>
              </tr>
            );
          })}
          {!roster.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
        </Table>
      )}

      {tab === "posts" && (
        <div className="space-y-3">
          <MobileCards
            empty="Chưa có bài học nào cho lớp và môn này."
            items={posts.map((p) => ({ key: p.id, href: `/bai-hoc/${p.id}`, title: p.title, chips: [`${p._count.exercises} bài tập`, `Đã xem ${p._count.views}/${roster.length}`, ...(p._count.exercises ? [`${p.exercises.reduce((n, e) => n + e._count.submissions, 0)} bài nộp`] : []), fmtDate(p.createdAt)] }))}
          />
          <div className="hidden md:block">
          <Table head={["Bài học", "Bài tập", "Đã xem", "Bài nộp", "Ngày đăng"]}>
            {posts.map((p) => (
              <tr key={p.id} className="align-middle [&>td]:!py-3">
                <td><Link data-row href={`/bai-hoc/${p.id}`} className="font-semibold text-orange-700 hover:underline">{p.title}</Link></td>
                <td>{p._count.exercises ? `${p._count.exercises} bài tập` : <span className="text-slate-400">—</span>}</td>
                <td>{p._count.views}/{roster.length}</td>
                <td>{p._count.exercises ? p.exercises.reduce((n, e) => n + e._count.submissions, 0) : <span className="text-slate-400">—</span>}</td>
                <td>{fmtDate(p.createdAt)}</td>
              </tr>
            ))}
            {!posts.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa có bài học nào cho lớp và môn này.</td></tr>}
          </Table>
          </div>
        </div>
      )}

      {tab === "scores" && (
        <div className="space-y-3">
          <Table head={["Học sinh", "Thường xuyên", "Giữa kỳ", "Cuối kỳ", "Điểm TB", "Xếp loại"]}>
            {roster.map((s) => {
              const es = entryOf(s.id);
              const avg = es.length ? avgOf.get(s.id) : undefined;
              const band = avg != null ? bandOf(avg) : null;
              const one = (t: string) => es.find((e) => e.scoreType === t)?.value;
              return (
                <tr key={s.id} className="align-middle [&>td]:!py-3">
                  <td><Link data-row href={`/hoc-sinh/${s.id}`} className="font-semibold text-orange-700 hover:underline">{s.fullName}</Link></td>
                  <td>{es.filter((e) => e.scoreType === "THUONG_XUYEN").map((e) => e.value).join(" · ") || "-"}</td>
                  <td>{one("GIUA_KY") ?? "-"}</td><td>{one("CUOI_KY") ?? "-"}</td>
                  <td>{band ? <b style={{ color: band.color }}>{avg!.toFixed(2)}</b> : "-"}</td>
                  <td>{band ? <span className="text-xs" style={{ color: band.color }}>{band.label}</span> : ""}</td>
                </tr>
              );
            })}
            {!roster.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
          </Table>
        </div>
      )}

      {tab === "diary" && (
        <Table head={["Ngày", "Tiết", "Vắng", "Xếp loại tiết", "Ghi chú"]}>
          {logs.map((l) => (
            <tr key={l.id} className="align-middle [&>td]:!py-3">
              <td>{fmtDate(l.logDate)}</td><td>{DAY[l.timetableSlot.dayOfWeek % 7]} · tiết {l.timetableSlot.periodNo}</td>
              <td>{l.attendanceAbsentCount}</td><td>{ratingText(ratings, l.conductRating)}</td><td>{l.note ?? "-"}</td>
            </tr>
          ))}
          {!logs.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa có bản ghi sổ đầu bài nào cho lớp và môn này.</td></tr>}
        </Table>
      )}
    </div>
  );
}
