import Link from "next/link";
import { BookOpen, GraduationCap, UserCheck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { Card, inputCls, Table, Title } from "@/components/ui";
import { AutoForm } from "@/components/auto-form";
import { MobileCollapse } from "@/components/mobile-collapse";
import { ViewToggle, pickView } from "@/components/view-toggle";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { todayUTC } from "@/lib/format";
import { assignmentWhere, isManager, termOptions } from "@/server/learning-scope";

export default async function MyClasses({ searchParams }: { searchParams: Promise<{ q?: string; termId?: string; all?: string; page?: string; size?: string; v?: string }> }) {
  const me = await requireRole(...TEACHING_ROLES, ...MANAGER_ROLES);
  const sp = await searchParams;
  const view = pickView(sp.v, "cards");
  const pg = getPaging(sp, 12);
  const manager = isManager(me);
  const where: Prisma.ClassSubjectAssignmentWhereInput = {
    AND: [
      assignmentWhere(me),
      sp.all ? {} : { academicTerm: { endDate: { gte: todayUTC() } } },
      sp.termId ? { academicTermId: sp.termId } : {},
      sp.q ? { OR: [{ schoolClass: { className: { contains: sp.q, mode: "insensitive" } } }, { subject: { subjectName: { contains: sp.q, mode: "insensitive" } } }] } : {},
    ],
  };
  const [terms, total, items] = await Promise.all([
    termOptions(),
    db.classSubjectAssignment.count({ where }),
    db.classSubjectAssignment.findMany({
      where, orderBy: [{ schoolClass: { className: "asc" } }, { subject: { subjectName: "asc" } }], skip: pg.skip, take: pg.take,
      include: { schoolClass: { include: { gradeLevel: true, homeroomTeacher: true, _count: { select: { enrollments: true } } } }, subject: true, teacher: true, academicTerm: { include: { academicYear: true } }, _count: { select: { lessonPosts: true } } },
    }),
  ]);
  return (
    <div className="space-y-4">
      <Title>{manager ? "Lớp - môn giảng dạy" : "Lớp của tôi"} ({total})</Title>
      <AutoForm className="flex flex-wrap gap-2">
        <input type="hidden" name="v" value={view} />
        <input name="q" defaultValue={sp.q} placeholder="Tìm lớp, môn..." className={inputCls + " min-w-48 flex-1"} />
        <MobileCollapse active={[sp.termId, sp.all].filter(Boolean).length}>
          <select name="termId" defaultValue={sp.termId ?? ""} className={inputCls}><option value="">Tất cả học kỳ</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border bg-white px-3 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"><input type="checkbox" name="all" value="1" defaultChecked={!!sp.all} /> Gồm học kỳ đã kết thúc</label>
        </MobileCollapse>
        <ViewToggle path="/lop-cua-toi" params={{ q: sp.q, termId: sp.termId, all: sp.all, size: sp.size }} view={view} />
      </AutoForm>
      {view === "table" ? (
        <Table head={["Lớp", "Môn", "Học kỳ", "Học sinh", "Bài đã đăng"]}>
          {items.map((c) => (
            <tr key={c.id} className="align-middle [&>td]:!py-3">
              <td><Link data-row href={`/lop-cua-toi/${c.id}`} className="font-semibold text-orange-700 hover:underline">{c.schoolClass.className}</Link>{manager && <div className="text-xs text-slate-500">GV: {c.teacher.fullName}</div>}</td>
              <td>{c.subject.subjectName}</td><td>{c.academicTerm.termName} · {c.academicTerm.academicYear.yearName}</td><td>{c.schoolClass._count.enrollments}</td><td>{c._count.lessonPosts}</td>
            </tr>
          ))}
          {!items.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Không có lớp phù hợp.</td></tr>}
        </Table>
      ) : (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((c) => (
          <Link key={c.id} href={`/lop-cua-toi/${c.id}`}>
            <Card className="flex h-full flex-col gap-3 transition-colors hover:border-orange-400">
              <div>
                <div className="text-base font-semibold">{c.schoolClass.className} · {c.subject.subjectName}</div>
                <div className="text-xs text-slate-500">{c.schoolClass.gradeLevel.gradeName} · {c.academicTerm.termName} · {c.academicTerm.academicYear.yearName}{manager ? ` · ${c.teacher.fullName}` : ""}</div>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm text-slate-600">
                <span className="flex items-center gap-1.5"><GraduationCap className="size-4 text-slate-400" /><b>{c.schoolClass._count.enrollments}</b> học sinh</span>
                <span className="flex items-center gap-1.5"><BookOpen className="size-4 text-slate-400" /><b>{c._count.lessonPosts}</b> bài đã đăng</span>
                {c.schoolClass.homeroomTeacherId === me.teacherId && <span className="flex items-center gap-1.5"><UserCheck className="size-4 text-slate-400" />Chủ nhiệm</span>}
              </div>
            </Card>
          </Link>
        ))}
        {!items.length && <p className="text-sm text-slate-500">Không có lớp phù hợp.</p>}
      </div>
      )}
      <Pagination total={total} page={pg.page} size={pg.size} path="/lop-cua-toi" params={{ q: sp.q, termId: sp.termId, all: sp.all, size: sp.size, v: sp.v }} />
    </div>
  );
}
