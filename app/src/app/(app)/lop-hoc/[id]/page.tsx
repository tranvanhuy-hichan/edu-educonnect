import { AssignmentRow } from "@/components/assignment-row";
import { loadScheduleSlots } from "@/modules/scheduling/schedule-slots";
import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GraduationCap, MoreHorizontal, Repeat, Users, CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { MANAGER_ROLES, TEACHING_ROLES, requireRole } from "@/lib/guard";
import { ClassWeek } from "../../so-dau-bai/class-week";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls, Table, Tabs } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { fmtDate } from "@/lib/format";
import { CLASS_CAPACITY, DAYS, DAY_NAME, currentTerm, hueOfStr, initialOf, rankOf } from "@/lib/catalog";
import { ClassFormFields } from "../class-fields";
import { deleteClass, enrollStudent, removeEnrollment, setMonitor, transferStudent, updateClass } from "../actions";
import { classAccounts } from "../../hoc-sinh/actions";
import { ImportStudents } from "./import-students";

const TABS = [["overview", "Tổng quan"], ["students", "Học sinh"], ["assignments", "Phân công giảng dạy"], ["timetable", "Thời khóa biểu"], ["diary", "Sổ đầu bài"], ["grades", "Bảng điểm"], ["settings", "Thông tin"]] as const;
const menuForm = "flex flex-col items-stretch gap-1 [&>button]:w-full [&>button]:justify-self-stretch";

export default async function ClassDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; w?: string; page?: string; size?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const canEdit = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const { id } = await params;
  const sp = await searchParams;
  // Giáo viên chỉ xem: tổng quan, phân công, thời khóa biểu, sổ đầu bài (không có danh sách học sinh, điểm, thông tin quản trị).
  const tabs = TABS.filter(([k]) => canEdit || ["overview", "assignments", "timetable", "diary"].includes(k));
  const tab = tabs.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const pg = getPaging(sp, 15);
  const c = await db.schoolClass.findUnique({ where: { id }, include: { subjects: { include: { subject: true } }, room: true, gradeLevel: true, academicYear: true, homeroomTeacher: true } });
  if (!c) notFound();
  const term = await currentTerm();
  const termId = term?.id ?? "-";
  const [studentCount, assignCount, slotCount] = await Promise.all([
    db.studentClassEnrollment.count({ where: { schoolClassId: id } }),
    db.classSubjectAssignment.count({ where: { schoolClassId: id, academicTermId: termId } }),
    db.timetableSlot.count({ where: { ...effectiveSlots(), schoolClassId: id, academicTermId: termId } }),
  ]);
  const base = `/lop-hoc/${id}`;
  const ended = c.academicYear.endDate < new Date();

  const Stat = ({ icon: I, label, value, tone = "bg-orange-100 text-orange-700" }: { icon: typeof Users; label: string; value: React.ReactNode; tone?: string }) => (
    <Card className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}><I className="size-4 sm:size-5" /></span>
      <div className="min-w-0"><div className="text-xs leading-tight text-slate-500">{label}</div><div className="truncate text-lg font-bold sm:text-xl">{value}</div></div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card mobile="flat" className="space-y-3">
        <div className="detail-summary-row flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">Lớp {c.className}</h1>
              {ended ? <span className="rounded bg-slate-200 px-2 py-0.5 text-xs">Năm học cũ</span> : <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Đang học</span>}
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{c.gradeLevel.gradeName}</span>
              {c.shift === "MORNING" ? (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">Ca sáng (Tiết 1–5)</span>
              ) : (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">Ca chiều (Tiết 6–10)</span>
              )}
            </div>
            <div className="mt-1 text-sm text-slate-600">{c.academicYear.yearName} · {fmtDate(c.academicYear.startDate)} → {fmtDate(c.academicYear.endDate)}</div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:flex sm:flex-wrap sm:gap-x-6">
              <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-slate-500">Phòng học cố định</dt><dd className="font-medium">{c.room?.roomName ?? "Chưa phân công"}</dd></div>
              <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-slate-500">GVCN</dt><dd className="truncate font-medium">{c.homeroomTeacher ? <Link href={`/giao-vien/${c.homeroomTeacher.id}`} className="hover:text-orange-700">{c.homeroomTeacher.fullName}</Link> : "-"}</dd></div>
              <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-slate-500">Sĩ số</dt><dd className="font-medium">{studentCount}/{CLASS_CAPACITY}</dd></div>
              <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-slate-500">Học kỳ hiện tại</dt><dd className="font-medium">{term?.termName ?? "-"}</dd></div>
            </dl>
          </div>
          {canEdit && (
          <div className="flex w-full items-center gap-2 md:w-auto md:flex-wrap">
            <div className="hidden md:block"><DialogButton wide variant="secondary" label="Nhập danh sách học sinh" title="Nhập danh sách học sinh & cấp tài khoản"><ImportStudents classId={id} /></DialogButton></div>
            <div className="min-w-0 flex-1 md:flex-none [&>button]:w-full md:[&>button]:w-auto"><DialogButton label="+ Xếp học sinh vào lớp" title="Xếp học sinh vào lớp"><EnrollForm classId={id} yearId={c.academicYearId} /></DialogButton></div>
            <details className="relative">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1 rounded-md border bg-white px-3 text-sm hover:bg-slate-50"><MoreHorizontal className="size-4" /> Khác</summary>
              <div className="absolute right-0 z-20 mt-1 w-[min(18rem,calc(100vw-3rem))] space-y-1 rounded-md border bg-white p-2 shadow-lg">
                <div className="space-y-1 md:hidden">
                  <div className="[&>button]:w-full"><DialogButton wide variant="secondary" label="Nhập danh sách học sinh" title="Nhập danh sách học sinh & cấp tài khoản"><ImportStudents classId={id} /></DialogButton></div>
                </div>
                <ActionForm action={classAccounts} submit="Cấp lại mật khẩu cả lớp (để in)" block reset={false} className={menuForm}><input type="hidden" name="classId" value={id} /></ActionForm>
                {me.roles.includes("ADMIN") && <ActionForm action={deleteClass} submit="Xoá lớp" block danger confirmText="Xoá hẳn lớp này?" className={menuForm}><input type="hidden" name="id" value={id} /></ActionForm>}
              </div>
            </details>
          </div>
          )}
        </div>
      </Card>

      <Tabs current={`?tab=${tab}`} items={tabs.map(([k, l]) => [`?tab=${k}`, l] as [string, string])} />

      {tab === "overview" && await (async () => {
        const [avgs, logs] = await Promise.all([
          db.subjectTermAverage.aggregate({ where: { academicTermId: termId, student: { enrollments: { some: { schoolClassId: id } } } }, _avg: { averageValue: true } }),
          db.classPeriodLog.findMany({ where: { schoolClassId: id }, orderBy: { logDate: "desc" }, take: 5, include: { timetableSlot: { include: { assignment: { include: { subject: true, teacher: true } } } } } }),
        ]);
        const avg = avgs._avg.averageValue;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat icon={Users} label="Sĩ số" value={`${studentCount}/${CLASS_CAPACITY}`} />
              <Stat icon={Repeat} label="Môn được phân công" value={assignCount} tone="bg-green-100 text-green-700" />
              <Stat icon={CalendarDays} label="Tiết/tuần" value={slotCount} tone="bg-sky-100 text-sky-700" />
              <Stat icon={GraduationCap} label="Điểm TB lớp" value={avg == null ? "-" : `${avg.toFixed(2)} · ${rankOf(avg)}`} tone="bg-yellow-100 text-yellow-700" />
            </div>
            <Card className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Sổ đầu bài gần đây</h2><Link href="?tab=diary" className="text-sm text-orange-700 hover:underline">Xem tất cả →</Link></div>
              <ul className="divide-y text-sm">
                {logs.map((l) => <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"><span><b>{fmtDate(l.logDate)}</b> · Tiết {l.timetableSlot.periodNo} · {l.timetableSlot.assignment.subject.subjectName}</span><span className="text-slate-500">{l.timetableSlot.assignment.teacher.fullName} · vắng {l.attendanceAbsentCount}</span></li>)}
                {!logs.length && <li className="px-4 py-8 text-center text-slate-500">Chưa có ghi chép nào.</li>}
              </ul>
            </Card>
          </div>
        );
      })()}

      {tab === "students" && await (async () => {
        const [list, others] = await Promise.all([
          db.studentClassEnrollment.findMany({ where: { schoolClassId: id }, include: { student: { include: { user: { select: { isActive: true } } } } }, orderBy: { student: { fullName: "asc" } }, skip: pg.skip, take: pg.take }),
          db.schoolClass.findMany({ where: { academicYearId: c.academicYearId, id: { not: id } }, orderBy: { className: "asc" }, select: { id: true, className: true } }),
        ]);
        const Transfer = ({ e }: { e: (typeof list)[number] }) => (
          <DialogButton variant="secondary" size="sm" label="Đổi lớp" title={`Đổi lớp · ${e.student.fullName}`}>
            <ActionForm action={transferStudent} submit="Chuyển lớp" className="flex flex-col gap-3 [&>button]:self-start">
              <input type="hidden" name="id" value={e.id} />
              <Field label="Chuyển sang lớp"><select name="toClassId" className={inputCls + " w-full"}><option value="">-- chọn lớp --</option>{others.map((o) => <option key={o.id} value={o.id}>{o.className}</option>)}</select></Field><Field label="Ngày hiệu lực"><input required type="date" name="effectiveDate" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })} className={inputCls + " w-full"} /></Field><Field label="Lý do"><input required minLength={5} name="reason" className={inputCls + " w-full"} /></Field><Field label="Số quyết định / căn cứ"><input required minLength={3} name="decisionReference" className={inputCls + " w-full"} /></Field>
            </ActionForm>
          </DialogButton>
        );
        return (
          <div className="space-y-3">
            <Table head={["Học sinh", "Ngày sinh", "Phụ huynh", "Tài khoản", "Thao tác"]}>
              {list.map((e) => {
                const hue = hueOfStr(e.studentId);
                return (
                  <tr key={e.id} className="align-middle [&>td]:!py-3">
                    <td><div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 25%)` }}>{initialOf(e.student.fullName)}</span>
                      <div className="min-w-0"><Link data-row className="block truncate font-semibold hover:text-orange-700" href={`/hoc-sinh/${e.studentId}`}>{e.student.fullName}</Link><div className="text-xs text-slate-500">{e.student.code}{c.monitorStudentId === e.studentId && <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 font-medium text-orange-800">Lớp trưởng</span>}</div></div>
                    </div></td>
                    <td className="whitespace-nowrap">{fmtDate(e.student.dob)}</td>
                    <td>{e.student.guardianName ? <><div className="text-sm">{e.student.guardianName}</div><div className="text-xs text-slate-500">{e.student.guardianPhone}</div></> : <span className="text-slate-400">—</span>}</td>
                    <td>{e.student.user?.isActive === false ? <span className="text-sm text-slate-500">Đã khóa</span> : <span className="text-sm text-green-700">Hoạt động</span>}</td>
                    <td><div className="flex flex-wrap items-center gap-1">
                      <ActionForm action={setMonitor} submit={c.monitorStudentId === e.studentId ? "Bỏ lớp trưởng" : "Chọn lớp trưởng"} compact ghost className="inline-flex"><input type="hidden" name="classId" value={id} /><input type="hidden" name="studentId" value={e.studentId} /></ActionForm>
                      <Transfer e={e} />
                      <ActionForm action={removeEnrollment} submit="Rút khỏi lớp" compact ghost danger confirmText="Rút học sinh khỏi lớp này?" className="inline-flex"><input type="hidden" name="id" value={e.id} /></ActionForm>
                    </div></td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
            </Table>
            <Pagination total={studentCount} page={pg.page} size={pg.size} path={base} params={{ tab: "students", size: sp.size }} />
          </div>
        );
      })()}

      {tab === "assignments" && await (async () => {
        const [curriculum, teachers] = await Promise.all([
          db.classSubject.findMany({ where: { schoolClassId: id }, orderBy: { subject: { subjectName: "asc" } }, include: { subject: true, assignments: { where: { academicTermId: termId }, include: { teacher: true, _count: { select: { timetableSlots: { where: effectiveSlots() } } } } } } }),
          db.teacher.findMany({ where: { user: { isActive: true } }, orderBy: { fullName: "asc" } }),
        ]);
        return <div className="content-panel overflow-hidden rounded-lg border bg-white"><p className="border-b p-4 text-sm text-slate-500">Môn đã chọn cho lớp · {term?.termName ?? "Chưa có học kỳ"}</p><ul className="divide-y">{curriculum.map((row) => <AssignmentRow key={row.subjectId} classId={id} className={c.className} termId={termId} subject={row.subject} assignment={row.assignments[0] ?? null} teachers={teachers} canEdit={canEdit && !!term} isAdmin={me.roles.includes("ADMIN")} />)}</ul>{!curriculum.length && <p className="p-4 text-sm text-slate-500">Chưa chọn môn học cho lớp. Vào tab Thông tin để chọn.</p>}</div>;
      })()}

      {tab === "timetable" && await (async () => {
        const slots = await loadScheduleSlots({ ...effectiveSlots(), schoolClassId: id, academicTermId: termId });
        const at = (d: number, p: number) => slots.find((s) => s.dayOfWeek === d && s.periodNo === p);
        return (
          <div className="space-y-3">
            <div className="flex justify-end"><Link href={`/lich-hoc?class=${id}`} className="inline-flex h-9 items-center rounded-md border bg-white px-4 text-sm hover:bg-slate-50">Mở thời khóa biểu</Link></div>
            <p className="text-xs text-slate-500 md:hidden">Vuốt ngang để xem đủ các ngày · Cột tiết được cố định.</p>
            <div className="class-timetable overflow-x-auto bg-white" role="region" aria-label="Thời khóa biểu lớp — cuộn ngang để xem các ngày" tabIndex={0}>
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">Thời khóa biểu lớp: hàng là tiết học, cột là ngày trong tuần</caption>
                <thead><tr className="bg-slate-50"><th scope="col" className="w-16 border-b px-2 py-2">Tiết</th>{DAYS.map((d) => <th key={d} scope="col" className="border-b px-2 py-2">{DAY_NAME[d]}</th>)}</tr></thead>
                <tbody>{Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
                  <tr key={p}><td className="border-b px-2 py-2 text-center text-slate-500">{p}</td>
                    {DAYS.map((d) => { const s = at(d, p); return <td key={d} className="border-b border-l px-2 py-1.5 align-top">{s ? <><div className="font-medium text-orange-700">{s.assignment.subject.subjectName}</div><div className="text-xs text-slate-500">{s.assignment.teacher.fullName} · {s.room.roomName}</div></> : null}</td>; })}
                  </tr>))}</tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {tab === "diary" && <ClassWeek me={me} cls={c} w={sp.w} base={{ tab: "diary" }} />}

      {tab === "grades" && await (async () => {
        const [list, avgs] = await Promise.all([
          db.studentClassEnrollment.findMany({ where: { schoolClassId: id }, include: { student: true }, orderBy: { student: { fullName: "asc" } }, skip: pg.skip, take: pg.take }),
          db.subjectTermAverage.findMany({ where: { academicTermId: termId, student: { enrollments: { some: { schoolClassId: id } } } } }),
        ]);
        return (
          <div className="space-y-3">
            <div className="flex justify-end"><Link href={`/nhap-diem?class=${id}`} className="inline-flex h-9 items-center rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700">Nhập / sửa điểm</Link></div>
            <Table head={["Học sinh", "Số môn có điểm", "Điểm TB", "Xếp loại"]}>
              {list.map((e) => {
                const mine = avgs.filter((a) => a.studentId === e.studentId);
                const avg = mine.length ? mine.reduce((s, a) => s + a.averageValue, 0) / mine.length : null;
                return <tr key={e.id}><td><Link data-row href={`/hoc-sinh/${e.studentId}?tab=grades`} className="text-orange-700 hover:underline">{e.student.fullName}</Link></td><td>{mine.length}</td><td className="font-bold">{avg == null ? "-" : avg.toFixed(2)}</td><td>{rankOf(avg)}</td></tr>;
              })}
              {!list.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Chưa có học sinh.</td></tr>}
            </Table>
            <Pagination total={studentCount} page={pg.page} size={pg.size} path={base} params={{ tab: "grades", size: sp.size }} />
          </div>
        );
      })()}

      {tab === "settings" && await (async () => {
        const [grades, years, teachers, rooms, subjects] = await Promise.all([
          db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }), db.academicYear.findMany({ orderBy: { startDate: "desc" } }), db.teacher.findMany({ orderBy: { fullName: "asc" } }), db.room.findMany({ orderBy: { roomName: "asc" } }), db.subject.findMany({ orderBy: { subjectName: "asc" } }),
        ]);
        return (
          <Card mobile="flat">
            <h2 className="mb-3 font-semibold">Thông tin lớp</h2>
            <ActionForm action={updateClass} submit="Lưu thông tin lớp" reset={false} className="flex flex-col gap-4 [&>button]:self-start">
              <input type="hidden" name="id" value={c.id} />
              <ClassFormFields subjects={subjects.map((subject) => ({ id: subject.id, label: subject.subjectName }))} rooms={rooms.map((room) => ({ id: room.id, label: room.roomName }))} grades={grades.map((g) => ({ id: g.id, label: g.gradeName }))} years={years.map((y) => ({ id: y.id, label: y.yearName }))} teachers={teachers.map((t) => ({ id: t.id, label: t.fullName }))}
                defaults={{ subjectIds: c.subjects.map((row) => row.subjectId), roomId: c.roomId, shift: c.shift, name: c.className, gradeLevelId: c.gradeLevelId, academicYearId: c.academicYearId, homeroomTeacherId: c.homeroomTeacherId }} />
            </ActionForm>
          </Card>
        );
      })()}
    </div>
  );
}

async function EnrollForm({ classId, yearId }: { classId: string; yearId: string }) {
  const students = await db.student.findMany({ where: { enrollments: { none: { academicYearId: yearId } } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, code: true }, take: 600 });
  return (
    <ActionForm action={enrollStudent} submit="Xếp lớp" className="flex flex-col gap-3 [&>button]:self-start">
      <input type="hidden" name="classId" value={classId} />
      <Field label="Học sinh chưa có lớp trong năm học này">
        <select name="studentId" className={inputCls + " w-full"}><option value="">-- chọn --</option>{students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.code})</option>)}</select>
      </Field>
    </ActionForm>
  );
}
