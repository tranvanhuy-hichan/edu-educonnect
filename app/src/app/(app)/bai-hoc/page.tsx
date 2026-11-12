import { AttachmentUpload } from "@/components/attachment-upload";
import { SearchableSelect } from "@/components/searchable-select";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { DialogButton } from "@/components/dialog";
import { ActionForm } from "@/components/action-form";
import { AutoForm } from "@/components/auto-form";
import { MobileCollapse } from "@/components/mobile-collapse";
import { ViewToggle, pickView } from "@/components/view-toggle";
import { Card, Field, inputCls, Table, Tabs, Title } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { fmtDate, todayUTC } from "@/lib/format";
import { assignmentWhere, currentTermId, isStudentOnly } from "@/server/learning-scope";
import { LessonTargetPicker } from "@/components/lesson-target-picker";
import { createPost } from "./actions";

type SP = { tab?: string; q?: string; assignmentId?: string; yearId?: string; termId?: string; subjectId?: string; classId?: string; sort?: string; page?: string; size?: string; v?: string };

export default async function LessonPosts({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES, "STUDENT");
  const sp = await searchParams;
  const student = isStudentOnly(me);
  if (!student) redirect("/giang-day"); // giáo viên/quản lý quản lý bài học theo Giảng dạy (môn → khối → lớp)
  const view = pickView(sp.v, student ? "cards" : "table");
  const pg = getPaging(sp, 12);
  const scope = assignmentWhere(me);
  const tab = sp.tab === "todo" && student ? "todo" : "all";
  const mineId = me.studentId ?? "-";

  // Lớp-môn trong phạm vi của người dùng → dùng để dựng các ô lọc (năm học, học kỳ, môn, lớp) và ô chọn khi đăng bài.
  const assignments = await db.classSubjectAssignment.findMany({ where: scope, orderBy: [{ schoolClass: { className: "asc" } }, { subject: { subjectName: "asc" } }], include: { schoolClass: true, subject: true, teacher: true, academicTerm: { include: { academicYear: true } } } });
  const terms = [...new Map(assignments.map((a) => [a.academicTermId, a.academicTerm])).values()].sort((x, y) => y.startDate.getTime() - x.startDate.getTime());
  const years = [...new Map(terms.map((t) => [t.academicYearId, t.academicYear])).values()];
  const curTerm = terms.find((t) => t.id === currentTermId(terms));
  // Mặc định hiển thị học kỳ đang diễn ra; "all" = tất cả.
  const termById = new Map(terms.map((t) => [t.id, t]));
  const yearSel = sp.yearId ?? (sp.termId && sp.termId !== "all" ? termById.get(sp.termId)?.academicYearId : undefined) ?? (sp.termId ? "all" : curTerm?.academicYearId ?? "all");
  const termSel = sp.termId ?? (sp.yearId ? (curTerm && curTerm.academicYearId === sp.yearId ? curTerm.id : "all") : curTerm?.id ?? "all");
  const termsOfYear = terms.filter((t) => yearSel === "all" || t.academicYearId === yearSel);
  const inPeriod = assignments.filter((a) => (termSel === "all" ? yearSel === "all" || a.academicTerm.academicYearId === yearSel : a.academicTermId === termSel));
  const subjectOpts = [...new Map(inPeriod.map((a) => [a.subjectId, a.subject.subjectName])).entries()].sort((x, y) => x[1].localeCompare(y[1], "vi"));
  const subjectSel = subjectOpts.some(([id]) => id === sp.subjectId) ? sp.subjectId : undefined;
  const classOpts = [...new Map(inPeriod.filter((a) => !subjectSel || a.subjectId === subjectSel).map((a) => [a.schoolClassId, a.schoolClass.className])).entries()].sort((x, y) => x[1].localeCompare(y[1], "vi", { numeric: true }));
  const classSel = classOpts.some(([id]) => id === sp.classId) ? sp.classId : undefined;

  const period: Prisma.ClassSubjectAssignmentWhereInput = termSel !== "all" ? { academicTermId: termSel } : yearSel !== "all" ? { academicTerm: { academicYearId: yearSel } } : {};
  const base: Prisma.LessonPostWhereInput = {
    assignment: { AND: [scope, period, subjectSel ? { subjectId: subjectSel } : {}, classSel ? { schoolClassId: classSel } : {}, sp.assignmentId ? { id: sp.assignmentId } : {}] },
    ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" as const } } : {}),
  };
  // Học sinh: bài học còn ít nhất một bài tập chưa nộp
  const todo: Prisma.LessonPostWhereInput = { exercises: { some: { submissions: { none: { studentId: mineId } } } } };
  const where: Prisma.LessonPostWhereInput = { ...base, ...(tab === "todo" ? todo : {}) };

  // Giáo viên/quản lý: mặc định hiện thẻ theo môn (như "Lớp của tôi"); bấm vào một môn mới xem danh sách bài học của môn đó.
  const dir = sp.sort === "old" ? "asc" : "desc";
  const overview = tab === "all" && !subjectSel && !classSel && !sp.assignmentId && !sp.q;
  const [nAll, nTodo, total, posts, counts] = await Promise.all([
    db.lessonPost.count({ where: base }),
    student ? db.lessonPost.count({ where: { ...base, ...todo } }) : Promise.resolve(0),
    db.lessonPost.count({ where }),
    overview ? Promise.resolve([]) : db.lessonPost.findMany({
      where, orderBy: [...(subjectSel ? [] : [{ assignment: { subject: { subjectName: "asc" as const } } }]), { createdAt: dir }], skip: pg.skip, take: pg.take,
      include: {
        assignment: { include: { schoolClass: true, subject: true, academicTerm: { include: { academicYear: true } } } },
        _count: { select: { views: true, exercises: true } },
        exercises: { select: { id: true, dueDate: true, submissions: { where: { studentId: mineId }, select: { id: true } } } },
      },
    }),
    overview ? db.lessonPost.findMany({ where: base, select: { assignmentId: true, exercises: { select: { submissions: { where: { studentId: mineId }, select: { id: true } } } } } }) : Promise.resolve([]),
  ]);
  const cnt = new Map<string, { posts: number; exercises: number; todo: number }>();
  for (const c of counts) { const x = cnt.get(c.assignmentId) ?? { posts: 0, exercises: 0, todo: 0 }; x.posts++; x.exercises += c.exercises.length; x.todo += c.exercises.filter((e) => !e.submissions.length).length; cnt.set(c.assignmentId, x); }
  const subjectCards = [...inPeriod.reduce((m, a) => {
    const key = `${a.subjectId}|${a.academicTermId}`;
    const g = m.get(key) ?? { key, subjectId: a.subjectId, subject: a.subject.subjectName, termId: a.academicTermId, yearId: a.academicTerm.academicYearId, term: `${a.academicTerm.termName} · ${a.academicTerm.academicYear.yearName}`, classes: [] as string[], teacher: a.teacher.fullName, posts: 0, exercises: 0, todo: 0 };
    g.classes.push(a.schoolClass.className); g.posts += cnt.get(a.id)?.posts ?? 0; g.exercises += cnt.get(a.id)?.exercises ?? 0; g.todo += cnt.get(a.id)?.todo ?? 0;
    return m.set(key, g);
  }, new Map<string, { key: string; subjectId: string; subject: string; termId: string; yearId: string; term: string; classes: string[]; teacher: string; posts: number; exercises: number; todo: number }>()).values()].sort((x, y) => x.subject.localeCompare(y.subject, "vi") || y.term.localeCompare(x.term));
  const sizes = await db.studentClassEnrollment.groupBy({ by: ["schoolClassId"], where: { schoolClassId: { in: [...new Set(posts.map((p) => p.assignment.schoolClassId))] } }, _count: { _all: true } });
  const sizeOf = new Map(sizes.map((s) => [s.schoolClassId, s._count._all]));
  const today = todayUTC();
  const canPost = !student && assignments.length > 0;
  const targets = assignments.map((a) => ({ id: a.id, classId: a.schoolClassId, className: a.schoolClass.className, subjectId: a.subjectId, subjectName: a.subject.subjectName, termId: a.academicTermId, termLabel: `${a.academicTerm.termName} · ${a.academicTerm.academicYear.yearName}` }));
  const params = { tab: sp.tab, q: sp.q, assignmentId: sp.assignmentId, yearId: yearSel, termId: termSel, subjectId: subjectSel, classId: classSel, sort: sp.sort, size: sp.size, v: sp.v };
  const filterCount = [subjectSel, classSel, sp.assignmentId, sp.sort === "old" ? "old" : ""].filter(Boolean).length + (termSel !== (curTerm?.id ?? "all") || yearSel !== (curTerm?.academicYearId ?? "all") ? 1 : 0);
  /** Dòng/tiêu đề nhóm theo môn — chỉ hiện khi môn đổi so với bài trước. */
  const groupOf = (i: number) => (subjectSel ? null : i === 0 || posts[i - 1].assignment.subjectId !== posts[i].assignment.subjectId ? posts[i].assignment.subject.subjectName : null);
  const periodOf = (p: (typeof posts)[number]) => `${p.assignment.academicTerm.termName} · ${p.assignment.academicTerm.academicYear.yearName}`;
  const tabItems: [string, string][] = [["?", `Tất cả (${nAll})`], ...(student ? [["?tab=todo", `Có bài tập chưa nộp (${nTodo})`] as [string, string]] : [])];

  /** Tình trạng bài tập của học sinh trong một bài học: đã nộp x/y, hạn gần nhất còn chưa nộp. */
  const exStatus = (p: (typeof posts)[number]) => {
    const total = p.exercises.length, done = p.exercises.filter((e) => e.submissions.length).length;
    const pending = p.exercises.filter((e) => !e.submissions.length && e.dueDate).map((e) => e.dueDate!).sort((x, y) => x.getTime() - y.getTime())[0];
    return { total, done, late: !!pending && pending < today, pending };
  };
  const ExBadge = ({ p }: { p: (typeof posts)[number] }) => {
    const s = exStatus(p);
    if (!s.total) return <span className="text-slate-400">Không có bài tập</span>;
    if (student) return <span className={s.done === s.total ? "font-medium text-green-700" : s.late ? "font-medium text-red-600" : "font-medium text-yellow-700"}>Đã nộp {s.done}/{s.total}{s.pending && s.done < s.total ? ` · hạn ${fmtDate(s.pending)}` : ""}</span>;
    return <span className="font-medium">{s.total} bài tập</span>;
  };

  const postBtn = (canPost ? (<DialogButton label="+ Đăng bài học" title="Đăng bài học">
        <ActionForm action={createPost} submit="Đăng bài" className="flex flex-col gap-3 [&>button]:self-start">
          <LessonTargetPicker options={targets} defaultTermId={termSel === "all" ? curTerm?.id : termSel} defaultAssignmentId={sp.assignmentId} />
          <Field label="Tiêu đề"><input name="title" className={inputCls + " w-full"} required /></Field>
          <Field label="Nội dung"><textarea name="content" rows={5} className={inputCls + " h-auto w-full py-2"} /></Field>
          <div className="space-y-1 text-xs font-semibold"><p>Tệp đính kèm</p><AttachmentUpload purpose="LESSON_POST" /></div>
          <p className="text-xs text-slate-500">Sau khi đăng, mở bài học và vào tab &ldquo;Bài tập&rdquo; để thêm bài tập cho bài này.</p>
        </ActionForm>
      </DialogButton>) : null);
  return (
    <div className="space-y-4">
      <Title right={postBtn}>Bài học ({nAll})</Title>
      <Tabs current={`?${tab === "all" ? "" : `tab=${tab}`}`} items={tabItems} />

      <div className="flex flex-wrap items-center gap-2">
      <AutoForm resets={{ yearId: ["termId"], subjectId: ["classId"] }} className="flex min-w-0 w-full flex-1 flex-wrap items-center gap-2">
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <input type="hidden" name="v" value={view} />
        {subjectSel && <input type="hidden" name="subjectId" value={subjectSel} />}
        <input name="q" defaultValue={sp.q} placeholder="Tìm bài học..." className={inputCls + " min-w-0 flex-1 md:min-w-48"} />
        <MobileCollapse active={filterCount}>
          <SearchableSelect key={yearSel} name="yearId" defaultValue={yearSel} emptyLabel="Tất cả năm học" allowEmpty ariaLabel="Năm học" className="w-full md:w-40" options={[{ value: "all", label: "Tất cả năm học" }, ...years.map((y) => ({ value: y.id, label: y.yearName }))]} />
          <SearchableSelect key={termSel} name="termId" defaultValue={termSel} ariaLabel="Học kỳ" className="w-full md:w-40" options={[{ value: "all", label: "Tất cả học kỳ" }, ...termsOfYear.map((t) => ({ value: t.id, label: `${t.termName}${yearSel === "all" ? ` · ${t.academicYear.yearName}` : ""}` }))]} />
          {!student && <SearchableSelect key={classSel ?? ""} name="classId" defaultValue={classSel ?? ""} emptyLabel="Tất cả lớp" ariaLabel="Lớp" className="w-full md:w-40" options={classOpts.map(([id, name]) => ({ value: id, label: name }))} />}
          {!overview && <select name="sort" defaultValue={sp.sort === "old" ? "old" : "new"} className={inputCls}><option value="new">Mới nhất</option><option value="old">Cũ nhất</option></select>}
          {!overview && <ViewToggle path="/bai-hoc" params={params} view={view} />}
        </MobileCollapse>

      </AutoForm>

      </div>

      {overview ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {subjectCards.map((g) => (
            <Link key={g.key} href={`/bai-hoc?${new URLSearchParams({ yearId: g.yearId, termId: g.termId, subjectId: g.subjectId })}`}>
              <Card className="flex h-full flex-col gap-3 transition-colors hover:border-orange-400">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700"><BookOpen className="size-5" /></span>
                  <div className="min-w-0">
                    <div className="text-base font-semibold leading-tight">{g.subject}</div>
                    <div className="text-xs text-slate-500">{g.term}</div>
                  </div>
                </div>
                <p className="text-sm text-slate-600">{student ? `GV: ${g.teacher}` : `Lớp: ${g.classes.sort((x, y) => x.localeCompare(y, "vi", { numeric: true })).join(", ")}`}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm text-slate-600">
                  <span><b>{g.posts}</b> bài học</span>
                  <span><b>{g.exercises}</b> bài tập</span>
                  {student && g.todo > 0 && <span className="font-medium text-yellow-700">{g.todo} chưa nộp</span>}
                </div>
              </Card>
            </Link>
          ))}
          {!subjectCards.length && <p className="text-sm text-slate-500">Chưa có môn nào trong kỳ này.</p>}
        </div>
      ) : (<>
      {view === "table" ? (
        <Table mobileLayout="compact" head={student ? ["Bài học", "Lớp · môn", "Bài tập", "Ngày đăng"] : ["Bài học", "Lớp · môn", "Bài tập", "Đã xem", "Ngày đăng"]}>
          {posts.map((p, i) => {
            const n = sizeOf.get(p.assignment.schoolClassId) ?? 0;
            const g = groupOf(i);
            return (
              <Fragment key={p.id}>
              {g && <tr className="subject-group"><td colSpan={student ? 4 : 5} className="bg-orange-50 !py-2 text-sm font-bold text-orange-800">{g}</td></tr>}
              <tr className="align-middle [&>td]:!py-3">
                <td className="min-w-48"><Link data-row href={`/bai-hoc/${p.id}`} className="font-semibold text-orange-700 hover:underline">{p.title}</Link></td>
                <td>{p.assignment.schoolClass.className} · {p.assignment.subject.subjectName}<div className="text-xs text-slate-500">{periodOf(p)}</div></td>
                <td><ExBadge p={p} /></td>
                {!student && <td className="min-w-32"><div className="text-xs"><b>{p._count.views}</b>/{n}</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${n ? Math.min(100, (p._count.views / n) * 100) : 0}%`, background: "var(--color-orange-500)" }} /></div></td>}
                <td>{fmtDate(p.createdAt)}</td>
              </tr>
              </Fragment>
            );
          })}
          {!posts.length && <tr><td colSpan={student ? 4 : 5} className="py-8 text-center text-slate-500">{canPost ? 'Chưa có bài học nào. Bấm "+ Đăng bài học" để đăng bài đầu tiên.' : "Chưa có bài học nào."}</td></tr>}
        </Table>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {posts.map((p, i) => {
            const n = sizeOf.get(p.assignment.schoolClassId) ?? 0;
            const g = groupOf(i);
            return (
              <Fragment key={p.id}>
              {g && <h2 className="col-span-full mt-2 border-b pb-1 text-sm font-bold text-orange-800 first:mt-0">{g}</h2>}
              <Link href={`/bai-hoc/${p.id}`}>
                <Card className="lesson-card flex h-full flex-col gap-3 transition-colors hover:border-orange-400">
                  <div className="flex items-start gap-3">
                    <span className="lesson-icon grid size-10 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700"><BookOpen className="size-5" /></span>
                    <div className="min-w-0">
                      <div className="lesson-title text-base font-semibold leading-tight">{p.title}</div>
                      <div className="text-xs text-slate-500">{p.assignment.schoolClass.className} · {p.assignment.subject.subjectName} · {periodOf(p)}</div>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-600">{p.content}</p>
                  <div className="lesson-footer mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-slate-500">
                    <ExBadge p={p} />
                    <span>{fmtDate(p.createdAt)}</span>
                    {!student && <span>Xem {p._count.views}/{n}</span>}
                  </div>
                </Card>
              </Link>
              </Fragment>
            );
          })}
          {!posts.length && <p className="text-sm text-slate-500">Chưa có bài học nào.</p>}
        </div>
      )}
      <Pagination total={total} page={pg.page} size={pg.size} path="/bai-hoc" params={params} />
      </>)}
    </div>
  );
}
