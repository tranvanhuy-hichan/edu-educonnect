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
import { assignmentWhere, isStudentOnly } from "@/server/learning-scope";
import { createPost } from "./actions";

type SP = { tab?: string; q?: string; assignmentId?: string; page?: string; size?: string; v?: string };

export default async function LessonPosts({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES, "STUDENT");
  const sp = await searchParams;
  const student = isStudentOnly(me);
  const view = pickView(sp.v, student ? "cards" : "table");
  const pg = getPaging(sp, 12);
  const scope = assignmentWhere(me);
  const tab = sp.tab === "todo" && student ? "todo" : "all";
  const mineId = me.studentId ?? "-";

  const base: Prisma.LessonPostWhereInput = {
    assignment: { AND: [scope, sp.assignmentId ? { id: sp.assignmentId } : {}] },
    ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" as const } } : {}),
  };
  // Học sinh: bài học còn ít nhất một bài tập chưa nộp
  const todo: Prisma.LessonPostWhereInput = { exercises: { some: { submissions: { none: { studentId: mineId } } } } };
  const where: Prisma.LessonPostWhereInput = { ...base, ...(tab === "todo" ? todo : {}) };

  const [assignments, nAll, nTodo, total, posts] = await Promise.all([
    db.classSubjectAssignment.findMany({ where: scope, orderBy: [{ schoolClass: { className: "asc" } }, { subject: { subjectName: "asc" } }], include: { schoolClass: true, subject: true, academicTerm: true } }),
    db.lessonPost.count({ where: base }),
    student ? db.lessonPost.count({ where: { ...base, ...todo } }) : Promise.resolve(0),
    db.lessonPost.count({ where }),
    db.lessonPost.findMany({
      where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take,
      include: {
        assignment: { include: { schoolClass: true, subject: true, academicTerm: true } },
        _count: { select: { views: true, exercises: true } },
        exercises: { select: { id: true, dueDate: true, submissions: { where: { studentId: mineId }, select: { id: true } } } },
      },
    }),
  ]);
  const sizes = await db.studentClassEnrollment.groupBy({ by: ["schoolClassId"], where: { schoolClassId: { in: [...new Set(posts.map((p) => p.assignment.schoolClassId))] } }, _count: { _all: true } });
  const sizeOf = new Map(sizes.map((s) => [s.schoolClassId, s._count._all]));
  const today = todayUTC();
  const canPost = !student && assignments.length > 0;
  const label = (a: (typeof assignments)[number]) => `${a.schoolClass.className} · ${a.subject.subjectName} · ${a.academicTerm.termName}`;
  const params = { tab: sp.tab, q: sp.q, assignmentId: sp.assignmentId, size: sp.size, v: sp.v };
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
          <Field label="Lớp · môn"><select name="assignmentId" defaultValue={sp.assignmentId ?? ""} className={inputCls + " w-full"} required><option value="">-- chọn lớp · môn --</option>{assignments.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}</select></Field>
          <Field label="Tiêu đề"><input name="title" className={inputCls + " w-full"} required /></Field>
          <Field label="Nội dung"><textarea name="content" rows={5} className={inputCls + " h-auto w-full py-2"} required /></Field>
          <Field label="Link đính kèm (mỗi dòng một link)"><textarea name="attachments" rows={2} className={inputCls + " h-auto w-full py-2"} placeholder="https://" /></Field>
          <p className="text-xs text-slate-500">Sau khi đăng, mở bài học và vào tab &ldquo;Bài tập&rdquo; để thêm bài tập cho bài này.</p>
        </ActionForm>
      </DialogButton>) : null);
  return (
    <div className="space-y-4">
      <Title>Bài học ({nAll})</Title>
      <Tabs current={`?${tab === "all" ? "" : `tab=${tab}`}`} items={tabItems} />

      <div className="flex flex-wrap items-center gap-2">
      <AutoForm className="contents">
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <input type="hidden" name="v" value={view} />
        <input name="q" defaultValue={sp.q} placeholder="Tìm bài học..." className={inputCls + " min-w-0 flex-1 md:min-w-48"} />
        <MobileCollapse active={[sp.assignmentId].filter(Boolean).length}>
          <select name="assignmentId" defaultValue={sp.assignmentId ?? ""} className={inputCls}><option value="">Tất cả lớp · môn</option>{assignments.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}</select>
        </MobileCollapse>
        <ViewToggle path="/bai-hoc" params={params} view={view} />
      </AutoForm>
      {postBtn && <div className="ml-auto flex items-center gap-2">{postBtn}</div>}
      </div>

      {view === "table" ? (
        <Table head={student ? ["Bài học", "Lớp · môn", "Bài tập", "Ngày đăng"] : ["Bài học", "Lớp · môn", "Bài tập", "Đã xem", "Ngày đăng"]}>
          {posts.map((p) => {
            const n = sizeOf.get(p.assignment.schoolClassId) ?? 0;
            return (
              <tr key={p.id} className="align-middle [&>td]:!py-3">
                <td className="min-w-48"><Link data-row href={`/bai-hoc/${p.id}`} className="font-semibold text-orange-700 hover:underline">{p.title}</Link></td>
                <td>{p.assignment.schoolClass.className} · {p.assignment.subject.subjectName}</td>
                <td><ExBadge p={p} /></td>
                {!student && <td className="min-w-32"><div className="text-xs"><b>{p._count.views}</b>/{n}</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${n ? Math.min(100, (p._count.views / n) * 100) : 0}%`, background: "var(--color-orange-500)" }} /></div></td>}
                <td>{fmtDate(p.createdAt)}</td>
              </tr>
            );
          })}
          {!posts.length && <tr><td colSpan={student ? 4 : 5} className="py-8 text-center text-slate-500">{canPost ? 'Chưa có bài học nào. Bấm "+ Đăng bài học" để đăng bài đầu tiên.' : "Chưa có bài học nào."}</td></tr>}
        </Table>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {posts.map((p) => {
            const n = sizeOf.get(p.assignment.schoolClassId) ?? 0;
            return (
              <Link key={p.id} href={`/bai-hoc/${p.id}`}>
                <Card className="flex h-full flex-col gap-3 transition-colors hover:border-orange-400">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700"><BookOpen className="size-5" /></span>
                    <div className="min-w-0">
                      <div className="text-base font-semibold leading-tight">{p.title}</div>
                      <div className="text-xs text-slate-500">{p.assignment.schoolClass.className} · {p.assignment.subject.subjectName} · {p.assignment.academicTerm.termName}</div>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-600">{p.content}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-slate-500">
                    <ExBadge p={p} />
                    <span>{fmtDate(p.createdAt)}</span>
                    {!student && <span>Xem {p._count.views}/{n}</span>}
                  </div>
                </Card>
              </Link>
            );
          })}
          {!posts.length && <p className="text-sm text-slate-500">Chưa có bài học nào.</p>}
        </div>
      )}
      <Pagination total={total} page={pg.page} size={pg.size} path="/bai-hoc" params={params} />
    </div>
  );
}
