import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CalendarDays, School, Users } from "lucide-react";
import { db } from "@/lib/db";
import { ADMIN_ROLES, MANAGER_ROLES, requireRole } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, Table, Tabs } from "@/components/ui";
import { currentTerm } from "@/lib/catalog";
import { deleteSubject, updateSubject } from "../actions";

const TABS = [["overview", "Tổng quan"], ["classes", "Lớp & giáo viên dạy"], ["settings", "Thông tin & Xoá"]] as const;
const ic = inputCls + " w-full";

export default async function SubjectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES);
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const s = await db.subject.findUnique({
    where: { id },
    include: { assignments: { orderBy: [{ academicTerm: { startDate: "desc" } }, { schoolClass: { className: "asc" } }], include: { schoolClass: { include: { gradeLevel: true } }, teacher: true, academicTerm: { include: { academicYear: true } }, _count: { select: { timetableSlots: { where: effectiveSlots() } } } } } },
  });
  if (!s) notFound();
  const term = await currentTerm();
  const now = s.assignments.filter((a) => a.academicTermId === term?.id);
  const isAdmin = me.roles.some((r) => ADMIN_ROLES.includes(r));

  const Stat = ({ icon: I, label, value, tone = "bg-orange-100 text-orange-700" }: { icon: typeof Users; label: string; value: React.ReactNode; tone?: string }) => (
    <Card className="flex items-center gap-3 p-4"><span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone}`}><I className="size-5" /></span><div><div className="text-xs text-slate-500">{label}</div><div className="text-xl font-bold">{value}</div></div></Card>
  );
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><BookOpen className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{s.subjectName}</h1></div>
          <div className="text-sm text-slate-600">{s.defaultPeriodsPerWeek} tiết/tuần mặc định</div>
        </div>
      </Card>
      <Tabs current={`?tab=${tab}`} items={TABS.map(([k, l]) => [`?tab=${k}`, l] as [string, string])} />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <Stat icon={School} label={`Lớp đang học${term ? ` (${term.termName})` : ""}`} value={new Set(now.map((a) => a.schoolClassId)).size} />
            <Stat icon={Users} label="Giáo viên đang dạy" value={new Set(now.map((a) => a.teacherId)).size} tone="bg-green-100 text-green-700" />
            <Stat icon={CalendarDays} label="Tiết/tuần mặc định" value={s.defaultPeriodsPerWeek} tone="bg-yellow-100 text-yellow-700" />
          </div>
        </div>
      )}

      {tab === "classes" && (
        <Table head={["Lớp", "Khối", "Giáo viên", "Học kỳ", "Số tiết/tuần"]}>
          {s.assignments.map((a) => (
            <tr key={a.id} className="align-top">
              <td><Link data-row href={`/lop-hoc/${a.schoolClassId}`} className="font-medium text-orange-700 hover:underline">{a.schoolClass.className}</Link></td>
              <td>{a.schoolClass.gradeLevel.gradeName}</td>
              <td><Link href={`/giao-vien/${a.teacherId}`} className="hover:underline">{a.teacher.fullName}</Link></td>
              <td>{a.academicTerm.termName} · {a.academicTerm.academicYear.yearName}</td>
              <td>{a._count.timetableSlots}/{s.defaultPeriodsPerWeek}</td>
            </tr>
          ))}
          {!s.assignments.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa có lớp nào học môn này. Phân công giáo viên dạy ở mục Phân công giảng dạy.</td></tr>}
        </Table>
      )}

      {tab === "settings" && (
        <div className="grid items-start gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <h2 className="font-semibold">Thông tin môn học</h2>
            <p className="mb-4 text-sm text-slate-500">Số tiết mỗi tuần mặc định được dùng khi xếp thời khoá biểu tự động.</p>
            <ActionForm action={updateSubject} submit="Lưu thay đổi" reset={false} className="flex flex-col gap-4 [&>button]:self-start">
              <input type="hidden" name="id" value={s.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Tên môn học *"><input name="name" defaultValue={s.subjectName} className={ic} required /></Field>
                <Field label="Số tiết mỗi tuần (mặc định)"><input name="periods" defaultValue={s.defaultPeriodsPerWeek} className={ic} /></Field>
              </div>
            </ActionForm>
          </Card>
          {isAdmin && (
            <Card className="space-y-3 border-red-300">
              <h2 className="font-semibold text-red-600">Vùng nguy hiểm</h2>
              <p className="text-sm text-slate-600">Xoá môn học không thể hoàn tác. Chỉ xoá được khi chưa phân công cho lớp nào ({s.assignments.length} phân công hiện tại).</p>
              <ActionForm action={deleteSubject} submit="Xoá môn học" danger confirmText={`Xoá môn ${s.subjectName}?`} className="inline-flex"><input type="hidden" name="id" value={s.id} /></ActionForm>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
