import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CalendarDays, Mail, MoreHorizontal, Phone, Repeat, Users } from "lucide-react";
import { db } from "@/lib/db";
import { ADMIN_ROLES, MANAGER_ROLES, TEACHING_ROLES, requireRole } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { Card, Table, Tabs } from "@/components/ui";
import { DAYS, DAY_NAME, ROLE_TAG, currentTerm } from "@/lib/catalog";
import { ROLE_LABEL } from "@/lib/nav";
import { TeacherFields } from "../teacher-fields";
import { deleteTeacher, resetTeacherPassword, toggleTeacherLocked, updateTeacher } from "../actions";

const TABS = [["overview", "Tổng quan"], ["info", "Thông tin cá nhân"], ["homeroom", "Lớp chủ nhiệm"], ["assign", "Phân công giảng dạy"], ["schedule", "Lịch dạy"], ["account", "Tài khoản"]] as const;
const menuForm = "flex flex-col items-stretch gap-1 [&>button]:w-full [&>button]:justify-self-stretch";

export default async function TeacherDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const canEdit = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const { id } = await params;
  const sp = await searchParams;
  const tabs = TABS.filter(([k]) => canEdit || (k !== "info" && k !== "account"));
  const tab = tabs.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const t = await db.teacher.findUnique({ where: { id }, include: { user: true } });
  if (!t) notFound();
  const term = await currentTerm();
  const isAdmin = me.roles.some((r) => ADMIN_ROLES.includes(r));
  const created = sp.created?.split("|");
  const [homeroom, assigns] = await Promise.all([
    db.schoolClass.findMany({ where: { homeroomTeacherId: id }, include: { gradeLevel: true, academicYear: true, _count: { select: { enrollments: true } } }, orderBy: { className: "asc" } }),
    db.classSubjectAssignment.findMany({ where: { teacherId: id, academicTermId: term?.id ?? "-" }, include: { subject: true, schoolClass: true, academicTerm: true, timetableSlots: { where: effectiveSlots(), include: { room: true } } }, orderBy: [{ schoolClass: { className: "asc" } }] }),
  ]);
  const slots = assigns.flatMap((a) => a.timetableSlots.map((s) => ({ ...s, a })));
  const Stat = ({ icon: I, label, value, tone = "bg-orange-100 text-orange-700" }: { icon: typeof Users; label: string; value: React.ReactNode; tone?: string }) => (
    <Card className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}><I className="size-4 sm:size-5" /></span><div className="min-w-0"><div className="text-xs leading-tight text-slate-500">{label}</div><div className="truncate text-lg font-bold sm:text-xl">{value}</div></div></Card>
  );

  return (
    <div className="space-y-4">
      {created && <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">Đã tạo giáo viên. Tài khoản <b>{created[0]}</b> · mật khẩu <b>{created[1]}</b> (chỉ hiện một lần, hãy ghi lại).</div>}
      <Card mobile="flat" className="flex flex-wrap items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-orange-100 text-2xl font-bold text-orange-700">{t.fullName.split(" ").pop()?.[0]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{t.fullName}</h1>
            {t.user.roles.filter((r) => ROLE_TAG[r]).map((r) => <span key={r} className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">{ROLE_TAG[r]}</span>)}
            {!t.user.isActive && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600">Tài khoản bị khoá</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {t.phone && <span className="flex items-center gap-1"><Phone className="size-4" />{t.phone}</span>}
            <span className="flex items-center gap-1"><Mail className="size-4" />{t.user.email}</span>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto md:flex-wrap">
          <Link href={`/lich-hoc?teacher=${t.id}`} className="inline-flex h-9 flex-[1.4] items-center justify-center whitespace-nowrap rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700 md:flex-none">Xem lịch dạy</Link>
          {isAdmin && (
            <details className="relative min-w-0 flex-1 md:flex-none">
              <summary className="inline-flex h-9 w-full cursor-pointer list-none items-center justify-center gap-1 rounded-md border bg-white px-3 text-sm hover:bg-slate-50 md:w-auto"><MoreHorizontal className="size-4" /> Khác</summary>
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border bg-white p-2 shadow-lg"><ActionForm action={deleteTeacher} submit="Xoá giáo viên" danger confirmText="Xoá giáo viên này?" className={menuForm}><input type="hidden" name="id" value={t.id} /></ActionForm></div>
            </details>
          )}
        </div>
      </Card>
      <Tabs current={`?tab=${tab}`} items={tabs.map(([k, l]) => [`?tab=${k}`, l] as [string, string])} />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat icon={BookOpen} label="Lớp chủ nhiệm" value={homeroom.length} />
            <Stat icon={Repeat} label="Môn-lớp được phân công" value={assigns.length} tone="bg-sky-100 text-sky-700" />
            <Stat icon={CalendarDays} label="Tiết dạy / tuần" value={slots.length} tone="bg-green-100 text-green-700" />
            <Stat icon={Users} label="Học sinh chủ nhiệm" value={homeroom.reduce((n, c) => n + c._count.enrollments, 0)} tone="bg-yellow-100 text-yellow-700" />
          </div>
          <Card className="space-y-1.5 text-sm"><h2 className="font-semibold">Vai trò</h2><div className="flex flex-wrap gap-2">{t.user.roles.map((r) => <span key={r} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{ROLE_LABEL[r]}</span>)}</div></Card>
        </div>
      )}

      {tab === "info" && <Card mobile="flat"><ActionForm action={updateTeacher} submit="Lưu thông tin" reset={false} className="flex flex-col gap-4 [&>button]:self-start"><input type="hidden" name="id" value={t.id} /><TeacherFields t={{ fullName: t.fullName, phone: t.phone }} roles={t.user.roles} /></ActionForm></Card>}

      {tab === "homeroom" && (
        <Table head={["Lớp", "Khối", "Năm học", "Sĩ số"]}>
          {homeroom.map((c) => <tr key={c.id}><td><Link data-row href={`/lop-hoc/${c.id}`} className="font-medium text-orange-700 hover:underline">{c.className}</Link></td><td>{c.gradeLevel.gradeName}</td><td>{c.academicYear.yearName}</td><td>{c._count.enrollments}</td></tr>)}
          {!homeroom.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Không chủ nhiệm lớp nào.</td></tr>}
        </Table>
      )}

      {tab === "assign" && (
        <Table head={["Lớp", "Môn học", "Học kỳ", "Tiết/tuần"]}>
          {assigns.map((a) => <tr key={a.id}><td><Link data-row href={`/lop-hoc/${a.schoolClassId}`} className="font-medium text-orange-700 hover:underline">{a.schoolClass.className}</Link></td><td>{a.subject.subjectName}</td><td>{a.academicTerm.termName}</td><td>{a.timetableSlots.length}</td></tr>)}
          {!assigns.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Chưa được phân công giảng dạy.</td></tr>}
        </Table>
      )}

      {tab === "schedule" && (
        <div className="content-panel overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="bg-slate-50"><th className="w-16 border-b px-2 py-2">Tiết</th>{DAYS.map((d) => <th key={d} className="border-b px-2 py-2">{DAY_NAME[d]}</th>)}</tr></thead>
            <tbody>{Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
              <tr key={p}><td className="border-b px-2 py-2 text-center text-slate-500">{p}</td>
                {DAYS.map((d) => { const s = slots.find((x) => x.dayOfWeek === d && x.periodNo === p); return <td key={d} className="border-b border-l px-2 py-1.5 align-top">{s ? <><div className="font-medium text-orange-700">{s.a.subject.subjectName}</div><div className="text-xs text-slate-500">{s.a.schoolClass.className} · {s.room.roomName}</div></> : null}</td>; })}
              </tr>))}</tbody>
          </table>
        </div>
      )}

      {tab === "account" && (
        <Card mobile="flat" className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Email đăng nhập</span><b>{t.user.email}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Mã giáo viên</span><b>{t.code ?? "-"}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Trạng thái</span><b>{t.user.isActive ? "Hoạt động" : "Đã khóa"}</b></div>
          <div className="flex flex-wrap gap-2">
            <ActionForm action={resetTeacherPassword} submit="Cấp lại mật khẩu" compact reset={false} className="inline-flex"><input type="hidden" name="id" value={t.id} /></ActionForm>
            <ActionForm action={toggleTeacherLocked} submit={t.user.isActive ? "Khóa tài khoản" : "Mở khóa"} compact danger={t.user.isActive} confirmText={t.user.isActive ? "Khóa tài khoản giáo viên này?" : undefined} reset={false} className="inline-flex"><input type="hidden" name="id" value={t.id} /></ActionForm>
          </div>
        </Card>
      )}
    </div>
  );
}
