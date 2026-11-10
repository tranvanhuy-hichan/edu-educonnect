import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardCheck, Percent, ScrollText, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { AutoForm } from "@/components/auto-form";
import { MobileCollapse } from "@/components/mobile-collapse";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls, Table, Tabs, Title } from "@/components/ui";
import { ViewToggle } from "@/components/view-toggle";
import { Pagination } from "@/components/pagination";
import { BarList, Donut } from "@/components/charts";
import { getPaging } from "@/lib/paging";
import { WEEKDAYS, addDays, fmtDate, isoDate, mondayOf, parseDate, todayUTC } from "@/lib/format";
import { clampWeek, shortDate, weekCount, weekNumber, weekStart } from "@/lib/week";
import { TEACHER_EDIT_DAYS } from "@/modules/attendance/attendance.service";
import { ClassWeek } from "./class-week";

const TABS = [["lop", "Danh sách lớp"], ["lich-su", "Lịch sử"], ["thong-ke", "Thống kê"]] as const;
const RATING: Record<string, [string, string]> = { TOT: ["Tốt", "bg-green-100 text-green-800"], KHA: ["Khá", "bg-sky-100 text-sky-800"], TB: ["Trung bình", "bg-yellow-100 text-yellow-800"], YEU: ["Yếu", "bg-red-100 text-red-600"] };
const GRADE_LETTER: Record<string, string> = { TOT: "A", KHA: "B", TB: "C", YEU: "D" };
const RATING_COLOR: Record<string, string> = { TOT: "#22c55e", KHA: "#0ea5e9", TB: "#eab308", YEU: "#ef4444" };

type SP = { v?: string; tab?: string; q?: string; all?: string; w?: string; class?: string; teacher?: string; rating?: string; from?: string; to?: string; page?: string; size?: string };
const validDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? parseDate(s) : null);

export default async function Diary({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const sp = await searchParams;
  const view = sp.v === "table" ? "table" : "cards";
  const tab = sp.tab === "lich-su" ? "lich-su" : sp.tab === "thong-ke" ? "thong-ke" : "lop";
  const staff = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const today = todayUTC();
  const pg = getPaging(sp, 20);

  // Giáo viên chỉ thấy lớp mình dạy hoặc chủ nhiệm; quản lý thấy tất cả.
  const classWhere = staff ? {} : { OR: [{ homeroomTeacherId: me.teacherId ?? "-" }, { assignments: { some: { teacherId: me.teacherId ?? "-" } } }] };
  const [classes, teachers] = await Promise.all([
    db.schoolClass.findMany({ where: classWhere, orderBy: [{ academicYear: { startDate: "desc" } }, { className: "asc" }], include: { academicYear: true, homeroomTeacher: { select: { fullName: true } }, _count: { select: { enrollments: true } } } }),
    staff ? db.teacher.findMany({ orderBy: { fullName: "asc" } }) : Promise.resolve([]),
  ]);
  const visibleClassIds = classes.map((c) => c.id);
  const fClass = visibleClassIds.includes(sp.class ?? "") ? sp.class! : "";
  const fTeacher = staff ? sp.teacher ?? "" : "";
  const ownsSlot = (s: { assignment: { teacherId: string } }) => staff || (!!me.teacherId && s.assignment.teacherId === me.teacherId);

  // Bộ lọc dùng chung cho Lịch sử và Thống kê.
  const from = validDate(sp.from), to = validDate(sp.to);
  const logWhere = {
    schoolClassId: fClass ? fClass : { in: visibleClassIds },
    ...(sp.rating && RATING[sp.rating] ? { conductRating: sp.rating } : {}),
    ...(fTeacher ? { timetableSlot: { assignment: { teacherId: fTeacher } } } : {}),
    ...(from || to ? { logDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  return (
    <div className="space-y-4">
      <Title>Sổ đầu bài</Title>
      <Tabs current={`?tab=${tab}`} items={TABS.map(([k, l]) => [`?tab=${k}`, l] as [string, string])} />

      {/* ===================== DANH SÁCH LỚP ===================== */}
      {tab === "lop" && !fClass && await (async () => {
        const q = (sp.q ?? "").trim().toLowerCase();
        const visible = classes.filter((c) => (sp.all || (c.academicYear.startDate <= today && c.academicYear.endDate >= today)) && (!q || c.className.toLowerCase().includes(q)));
        const rows = visible.slice(pg.skip, pg.skip + pg.take);
        const monday = mondayOf(today);
        const weekDays = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
        const ids = rows.map((c) => c.id);
        const [slots, logCounts] = ids.length ? await Promise.all([
          db.timetableSlot.findMany({ where: { ...effectiveSlots(monday), schoolClassId: { in: ids } }, select: { schoolClassId: true, dayOfWeek: true, academicTerm: { select: { startDate: true, endDate: true } } } }),
          db.classPeriodLog.groupBy({ by: ["schoolClassId"], where: { schoolClassId: { in: ids }, logDate: { gte: monday, lte: weekDays[5] } }, _count: true }),
        ]) : [[], []];
        const done = new Map(logCounts.map((l) => [l.schoolClassId, l._count]));
        const expected = (classId: string) => weekDays.reduce((n, d, i) => n + slots.filter((x) => x.schoolClassId === classId && x.dayOfWeek === i + 2 && x.academicTerm.startDate <= d && x.academicTerm.endDate >= d).length, 0);
        return (
          <div className="space-y-3">
            <AutoForm className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="lop" /><input type="hidden" name="v" value={view} />
              <input name="q" defaultValue={sp.q} placeholder="Tìm lớp..." className={inputCls + " min-w-48 flex-1 max-md:w-full max-md:basis-full"} />
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm max-md:flex-1 max-md:justify-center has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"><input type="checkbox" name="all" value="1" defaultChecked={!!sp.all} /> Gồm lớp năm học cũ</label>
            <div className="hidden md:block"><ViewToggle path="/so-dau-bai" params={{ tab: "lop", q: sp.q, all: sp.all, size: sp.size }} view={view} /></div>
            </AutoForm>
            {view === "cards" && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {rows.map((c) => {
                  const exp = expected(c.id), got = done.get(c.id) ?? 0;
                  const pct = exp ? Math.min(100, Math.round((got / exp) * 100)) : 0;
                  return (
                    <Link key={c.id} href={`?tab=lop&class=${c.id}`} className="block rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-orange-400">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><div className="text-lg font-semibold text-orange-700">{c.className}</div><div className="text-xs text-slate-500">{c.academicYear.yearName}</div></div>
                        <span className="shrink-0 text-sm"><b>{c._count.enrollments}</b> <span className="text-xs text-slate-500">học sinh</span></span>
                      </div>
                      <div className="mt-2 text-sm"><span className="text-xs text-slate-500">GVCN: </span>{c.homeroomTeacher?.fullName ?? <span className="text-slate-400">Chưa có</span>}</div>
                      <div className="mt-3 border-t pt-3">
                        {exp ? <><div className="flex justify-between text-xs"><span className="text-slate-500">Sổ đầu bài tuần này · {got}/{exp} tiết</span><b>{pct}%</b></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "var(--color-orange-500)" }} /></div></> : <span className="text-xs text-slate-400">Tuần này không có tiết</span>}
                      </div>
                    </Link>
                  );
                })}
                {!rows.length && <p className="text-sm text-slate-500">Không có lớp nào.</p>}
              </div>
            )}
            {view === "table" && <Table head={["Lớp", "GVCN", "Sĩ số", "Sổ đầu bài tuần này"]}>
              {rows.map((c) => {
                const exp = expected(c.id), got = done.get(c.id) ?? 0;
                const pct = exp ? Math.min(100, Math.round((got / exp) * 100)) : 0;
                return (
                  <tr key={c.id} className="align-middle [&>td]:!py-3.5">
                    <td className="w-[22%] min-w-32"><Link data-row href={`?tab=lop&class=${c.id}`} className="text-base font-semibold text-orange-700 hover:underline">{c.className}</Link><div className="text-xs text-slate-500">{c.academicYear.yearName}</div></td>
                    <td className="w-[26%] min-w-40">{c.homeroomTeacher?.fullName ?? <span className="text-slate-400">Chưa có</span>}</td>
                    <td className="w-[14%] whitespace-nowrap"><b>{c._count.enrollments}</b> <span className="text-xs text-slate-500">học sinh</span></td>
                    <td className="w-[38%] min-w-48">
                      <div className="flex items-center gap-3">
                        {exp ? <div className="min-w-0 flex-1"><div className="flex justify-between text-xs"><span>{got}/{exp} tiết</span><b>{pct}%</b></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "var(--color-orange-500)" }} /></div></div> : <span className="flex-1 text-xs text-slate-400">Không có tiết trong tuần này</span>}
                        <ChevronRight className="size-4 shrink-0 text-slate-400" />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Không có lớp nào.</td></tr>}
            </Table>}
            <Pagination total={visible.length} page={pg.page} size={pg.size} path="/so-dau-bai" params={{ tab: "lop", v: sp.v, q: sp.q, all: sp.all, size: sp.size }} />
          </div>
        );
      })()}

      {/* ===================== SỔ ĐẦU BÀI CỦA MỘT LỚP: Tuần → Ngày → Môn ===================== */}
      {tab === "lop" && fClass && <ClassWeek me={me} cls={classes.find((c) => c.id === fClass)!} classes={classes} teachers={teachers} w={sp.w} fTeacher={fTeacher} base={{ tab: "lop", class: fClass }} />}

      {/* ===================== LỊCH SỬ ===================== */}
      {tab === "lich-su" && await (async () => {
        const [total, rows] = await Promise.all([
          db.classPeriodLog.count({ where: logWhere }),
          db.classPeriodLog.findMany({
            where: logWhere, orderBy: [{ logDate: "desc" }, { timetableSlot: { periodNo: "asc" } }], skip: pg.skip, take: pg.take,
            include: { schoolClass: { include: { academicYear: true } }, timetableSlot: { include: { assignment: { include: { subject: true, teacher: true } }, room: true } } },
          }),
        ]);
        return (
          <div className="space-y-3">
            <FilterBar sp={sp} classes={classes} teachers={teachers} staff={staff} tab="lich-su" />
            <Table head={["Ngày", "Tiết", "Lớp", "Môn", "Giáo viên", "Vắng", "Xếp loại", "Nhận xét"]}>
              {rows.map((r) => (
                <tr key={r.id} className="align-middle">
                  <td className="tabular-nums">{fmtDate(r.logDate)}<div className="text-xs text-slate-500">{WEEKDAYS[r.logDate.getUTCDay()]} · Tuần {weekNumber(r.schoolClass.academicYear.startDate, r.logDate)}</div></td>
                  <td>Tiết {r.timetableSlot.periodNo}</td>
                  <td className="font-medium">{r.schoolClass.className}</td>
                  <td>{r.timetableSlot.assignment.subject.subjectName}</td>
                  <td>{r.timetableSlot.assignment.teacher.fullName}</td>
                  <td>{r.attendanceAbsentCount}</td>
                  <td>{r.conductRating ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RATING[r.conductRating]?.[1]}`}><b className="mr-1">{GRADE_LETTER[r.conductRating]}</b>{RATING[r.conductRating]?.[0]}</span> : <span className="text-slate-400">-</span>}</td>
                  <td className="max-w-xs truncate text-slate-600" title={r.note ?? ""}>{r.note ?? "-"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Chưa có bản ghi sổ đầu bài nào.</td></tr>}
            </Table>
            <Pagination total={total} page={pg.page} size={pg.size} path="/so-dau-bai" params={{ tab: "lich-su", size: sp.size, class: fClass, teacher: fTeacher, rating: sp.rating, from: sp.from, to: sp.to }} />
          </div>
        );
      })()}

      {/* ===================== THỐNG KÊ ===================== */}
      {tab === "thong-ke" && await (async () => {
        const [count, sum, byRating, byClass] = await Promise.all([
          db.classPeriodLog.count({ where: logWhere }),
          db.classPeriodLog.aggregate({ where: logWhere, _sum: { attendanceAbsentCount: true } }),
          db.classPeriodLog.groupBy({ by: ["conductRating"], where: logWhere, _count: true }),
          db.classPeriodLog.groupBy({ by: ["schoolClassId"], where: logWhere, _sum: { attendanceAbsentCount: true }, _count: true }),
        ]);
        const rated = byRating.filter((r) => r.conductRating);
        const ratedTotal = rated.reduce((s, r) => s + r._count, 0);
        const good = rated.filter((r) => r.conductRating === "TOT").reduce((s, r) => s + r._count, 0);
        const name = new Map(classes.map((c) => [c.id, c.className]));
        return (
          <div className="space-y-3">
            <FilterBar sp={sp} classes={classes} teachers={teachers} staff={staff} tab="thong-ke" noRating />
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
              <Card><div className="flex items-center gap-2 text-xs text-gray-500"><ScrollText className="size-4" />Tiết đã ghi sổ</div><div className="text-2xl font-bold sm:text-3xl">{count}</div></Card>
              <Card><div className="flex items-center gap-2 text-xs text-gray-500"><Users className="size-4" />Tổng lượt vắng</div><div className="text-2xl font-bold sm:text-3xl">{sum._sum.attendanceAbsentCount ?? 0}</div></Card>
              <Card><div className="flex items-center gap-2 text-xs text-gray-500"><Percent className="size-4" />Tiết xếp loại Tốt</div><div className="text-2xl font-bold sm:text-3xl">{ratedTotal ? Math.round((good / ratedTotal) * 100) : 0}%</div><div className="text-xs text-gray-500">{good}/{ratedTotal} tiết đã xếp loại</div></Card>
              <Card><div className="flex items-center gap-2 text-xs text-gray-500"><ClipboardCheck className="size-4" />Vắng TB / tiết</div><div className="text-2xl font-bold sm:text-3xl">{count ? ((sum._sum.attendanceAbsentCount ?? 0) / count).toFixed(1) : "0"}</div></Card>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="space-y-3"><h2 className="font-semibold">Xếp loại tiết học</h2>
                <Donut items={Object.entries(RATING).map(([k, [l]]) => ({ label: l, value: byRating.find((r) => r.conductRating === k)?._count ?? 0, color: RATING_COLOR[k] }))} center={<div><div className="text-2xl font-bold">{ratedTotal}</div><div className="text-xs text-slate-500">tiết</div></div>} />
              </Card>
              <Card className="space-y-3"><h2 className="font-semibold">Lượt vắng theo lớp</h2>
                {byClass.length ? <BarList items={byClass.map((c) => ({ label: name.get(c.schoolClassId) ?? "-", value: c._sum.attendanceAbsentCount ?? 0, hint: `/${c._count} tiết` })).sort((a, b) => b.value - a.value).slice(0, 12)} /> : <p className="text-sm text-slate-500">Chưa có dữ liệu.</p>}
              </Card>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/** Thanh lọc dùng chung cho tab Lịch sử và Thống kê (AutoForm: đổi là lọc ngay). */
function FilterBar({ sp, classes, teachers, staff, tab, noRating }: { sp: SP; classes: { id: string; className: string }[]; teachers: { id: string; fullName: string }[]; staff: boolean; tab: string; noRating?: boolean }) {
  const n = [sp.class, sp.teacher, sp.rating, sp.from, sp.to].filter(Boolean).length;
  return (
    <AutoForm className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="tab" value={tab} />
      <input type="date" name="from" defaultValue={sp.from} className={inputCls} aria-label="Từ ngày" />
      <input type="date" name="to" defaultValue={sp.to} className={inputCls} aria-label="Đến ngày" />
      <MobileCollapse active={[sp.class, sp.teacher, sp.rating].filter(Boolean).length}>
        <select name="class" defaultValue={sp.class ?? ""} className={inputCls} aria-label="Lớp"><option value="">Tất cả lớp</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.className}</option>)}</select>
        {staff && <select name="teacher" defaultValue={sp.teacher ?? ""} className={inputCls} aria-label="Giáo viên"><option value="">Tất cả giáo viên</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select>}
        {!noRating && <select name="rating" defaultValue={sp.rating ?? ""} className={inputCls} aria-label="Xếp loại"><option value="">Tất cả xếp loại</option>{Object.entries(RATING).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}
        {n > 0 && <Link href={`/so-dau-bai?tab=${tab}`} className="inline-flex h-9 items-center rounded-md px-2 text-sm text-slate-500 hover:text-orange-700">Xoá lọc</Link>}
      </MobileCollapse>
    </AutoForm>
  );
}
