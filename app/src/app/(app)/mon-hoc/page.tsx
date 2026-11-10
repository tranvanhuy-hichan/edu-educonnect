import Link from "next/link";
import { ViewToggle, pickView } from "@/components/view-toggle";
import { AutoForm } from "@/components/auto-form";
import { BookOpen, CalendarDays, School } from "lucide-react";
import { db } from "@/lib/db";
import { MANAGER_ROLES, requireRole } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls, Table, Title } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { currentTerm } from "@/lib/catalog";
import { createSubject } from "./actions";

const ic = inputCls + " w-full";

export default async function Subjects({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; size?: string; v?: string }> }) {
  await requireRole(...MANAGER_ROLES);
  const sp = await searchParams;
  const view = pickView(sp.v, "cards");
  const pg = getPaging(sp, 12);
  const term = await currentTerm();
  const where = sp.q ? { subjectName: { contains: sp.q, mode: "insensitive" as const } } : {};
  const [total, list] = await Promise.all([
    db.subject.count({ where }),
    db.subject.findMany({ where, orderBy: { subjectName: "asc" }, skip: pg.skip, take: pg.take, include: { assignments: { where: { academicTermId: term?.id ?? "-" }, select: { schoolClassId: true, teacherId: true } } } }),
  ]);
  const rows = list.map((s) => ({ s, classes: new Set(s.assignments.map((a) => a.schoolClassId)).size, teachers: new Set(s.assignments.map((a) => a.teacherId)).size }));
  const cards = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map(({ s, classes, teachers }) => (
        <Link key={s.id} href={`/mon-hoc/${s.id}`} className="group">
          <Card className="flex h-full flex-col gap-4 transition-all group-hover:-translate-y-0.5 group-hover:border-orange-400 group-hover:shadow-md">
            <div className="flex flex-1 flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><BookOpen className="size-6" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold leading-snug group-hover:text-orange-700">{s.subjectName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {term && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">{term.termName} · {term.academicYear.yearName}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <span className="flex items-center gap-1.5"><School className="size-4 text-slate-400" /><b className="text-base" style={{ color: "var(--fg)" }}>{classes}</b> lớp</span>
                <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-slate-400" /><b className="text-base" style={{ color: "var(--fg)" }}>{s.defaultPeriodsPerWeek}</b> tiết/tuần</span>
              </div>
              <div className="mt-auto flex items-end justify-between border-t pt-3">
                <span className="text-xs text-slate-500">Giáo viên đang dạy</span>
                <span className="text-lg font-bold tabular-nums text-orange-700">{teachers}</span>
              </div>
            </div>
          </Card>
        </Link>
      ))}
      {!rows.length && <p className="text-sm text-slate-500">Chưa có môn học.</p>}
    </div>
  );
  return (
    <div className="space-y-4">
      <Title right={<>
        <DialogButton wide label="+ Thêm môn học" title="Thêm môn học">
          <ActionForm action={createSubject} submit="Tạo môn học" className="flex flex-col gap-3 [&>button]:self-start">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tên môn học *"><input name="name" className={ic} required placeholder="vd: Toán" /></Field>
              <Field label="Số tiết mỗi tuần (mặc định)"><input name="periods" defaultValue={2} className={ic} /></Field><Field label="Hình thức đánh giá"><select name="assessmentType" defaultValue={"SCORE"} className={ic}><option value="SCORE">Nhận xét kết hợp điểm số</option><option value="COMMENT">Nhận xét: Đạt / Chưa đạt</option></select></Field><Field label="Số tiết cả năm (xác định số điểm TX)"><input required type="number" min={1} max={700} name="annualPeriods" defaultValue={70} className={ic} /></Field>
            </div>
          </ActionForm>
        </DialogButton>
        <div className="md:hidden"><ViewToggle path="/mon-hoc" params={{ q: sp.q, size: sp.size }} view={view} /></div>
      </>}>Môn học ({total})</Title>
      <AutoForm className="flex gap-2"><input type="hidden" name="v" value={view} /><input name="q" defaultValue={sp.q} placeholder="Tìm môn học..." className={inputCls + " min-w-0 flex-1"} /><div className="hidden md:block"><ViewToggle path="/mon-hoc" params={{ q: sp.q, size: sp.size }} view={view} /></div></AutoForm>
      {view !== "cards" && <div className="md:hidden">{cards}</div>}
      {view === "cards" ? cards : (
        <div className="hidden md:block"><Table head={["Môn học", "Số lớp", "Giáo viên", "Tiết/tuần mặc định"]}>
          {rows.map(({ s, classes, teachers }) => (
            <tr key={s.id} className="align-middle [&>td]:!py-3">
              <td><Link data-row href={`/mon-hoc/${s.id}`} className="font-semibold text-orange-700 hover:underline">{s.subjectName}</Link></td>
              <td>{classes}</td><td>{teachers}</td><td>{s.defaultPeriodsPerWeek}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Chưa có môn học.</td></tr>}
        </Table></div>
      )}
      <Pagination total={total} page={pg.page} size={pg.size} path="/mon-hoc" params={{ q: sp.q, size: sp.size, v: sp.v }} />
    </div>
  );
}
