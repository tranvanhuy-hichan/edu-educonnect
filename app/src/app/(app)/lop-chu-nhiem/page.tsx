import { YearResults } from "@/components/academic/year-results";
import { SearchableSelect } from "@/components/searchable-select";
import { loadScheduleSlots } from "@/modules/scheduling/schedule-slots";
import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, AlertCircle, BarChart3, CalendarCheck, GraduationCap, Trophy, Users } from "lucide-react";
import { db } from "@/lib/db";
import { ClassWeek } from "../so-dau-bai/class-week";
import { requireRole, MANAGER_ROLES } from "@/lib/guard";
import { MobileCollapse } from "@/components/mobile-collapse";
import { AutoForm } from "@/components/auto-form";
import { Card, inputCls, Table, Tabs } from "@/components/ui";
import { ColumnChart } from "@/components/charts";
import { fmtDate } from "@/lib/format";
import { bandOf } from "@/server/grades-stats";
import { currentTermId, isManager } from "@/server/learning-scope";

type SP = { sub?: string; a?: string; w?: string; tab?: string; classId?: string; termId?: string; page?: string; size?: string };
// Chỉ hai tab nằm trong trang; các chức năng còn lại (bảng điểm, thời khóa biểu, sổ đầu bài, thi đua, xét lên lớp) mở từ menu bên trái.
const TABS = [["overview", "Tổng quan"], ["students", "Học sinh"]] as const;
const SECTIONS = ["overview", "students", "scores", "timetable", "diary", "emulation", "year"];
const SECTION_TITLE: Record<string, string> = { scores: "Bảng điểm lớp", timetable: "Thời khóa biểu lớp", diary: "Sổ đầu bài lớp", emulation: "Thi đua lớp", year: "Xét lên lớp" };
const fmt = (n: number | null | undefined, d = 2) => (n == null ? "—" : n.toFixed(d));

export default async function Homeroom({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole("HOMEROOM_TEACHER", ...MANAGER_ROLES);
  const sp = await searchParams;
  const tab = SECTIONS.includes(sp.tab ?? "") ? sp.tab! : "overview";

  const classes = await db.schoolClass.findMany({
    where: isManager(me) ? {} : { homeroomTeacherId: me.teacherId ?? "-" },
    orderBy: [{ academicYear: { startDate: "desc" } }, { className: "asc" }],
    include: { gradeLevel: true, academicYear: true, homeroomTeacher: true },
  });
  if (!classes.length) {
    return <div className="space-y-4"><h1 className="text-base font-semibold sm:text-xl">Lớp chủ nhiệm</h1><Card className="py-10 text-center text-sm text-slate-500">Bạn chưa được phân công chủ nhiệm lớp nào. Liên hệ Hiệu trưởng/Hiệu phó để được phân công.</Card></div>;
  }
  const cls = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const terms = await db.academicTerm.findMany({ where: { academicYearId: cls.academicYearId }, orderBy: { startDate: "desc" } });
  const term = terms.find((t) => t.id === sp.termId) ?? terms.find((t) => t.id === currentTermId(terms)) ?? null;

  const enrollments = await db.studentClassEnrollment.findMany({ where: { schoolClassId: cls.id }, include: { student: true } });
  const seen = new Set<string>();
  const roster = enrollments.filter((e) => !seen.has(e.studentId) && seen.add(e.studentId)).map((e) => e.student).sort((x, y) => x.fullName.localeCompare(y.fullName, "vi"));
  const ids = roster.map((s) => s.id);

  const [assignments, averages] = await Promise.all([
    term ? db.classSubjectAssignment.findMany({ where: { schoolClassId: cls.id, academicTermId: term.id }, include: { subject: true, teacher: true }, orderBy: { subject: { subjectName: "asc" } } }) : Promise.resolve([]),
    term ? db.subjectTermAverage.findMany({ where: { academicTermId: term.id, studentId: { in: ids }, assignment: { schoolClassId: cls.id } } }) : Promise.resolve([]),
  ]);
  const cell = new Map(averages.map((a) => [`${a.studentId}|${a.assignmentId}`, a.averageValue]));
  const studentAvg = (sid: string) => { const v = averages.filter((a) => a.studentId === sid).map((a) => a.averageValue); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const classAvg = averages.length ? averages.reduce((x, a) => x + a.averageValue, 0) / averages.length : null;
  const q = (k: string, v: string) => `?tab=${k}&classId=${cls.id}${term ? `&termId=${term.id}` : ""}${v}`;

  const Stat = ({ icon: I, label, value, tone = "bg-orange-100 text-orange-700" }: { icon: typeof Users; label: string; value: React.ReactNode; tone?: string }) => (
    <Card className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}><I className="size-4 sm:size-5" /></span><div className="min-w-0"><div className="text-xs leading-tight text-slate-500">{label}</div><div className="truncate text-lg font-bold sm:text-xl">{value}</div></div></Card>
  );
  if (!cls) notFound();

  return (
    <div className="space-y-4">
      <Card className="detail-header homeroom-heading flex flex-wrap items-center gap-2.5 sm:gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700 sm:size-14 sm:rounded-xl"><GraduationCap className="size-5 sm:size-7" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">Lớp {cls.className}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 sm:gap-x-4 sm:text-sm">
            <span>{cls.gradeLevel.gradeName}</span><span>Năm học {cls.academicYear.yearName}</span>
            <span>GVCN: {cls.homeroomTeacher?.fullName ?? "Chưa phân công"}</span><span>{roster.length} học sinh</span>
          </div>
        </div>
        <AutoForm className="flex flex-wrap gap-2">
          <input type="hidden" name="tab" value={tab} />
          {classes.length > 1 && <SearchableSelect key={cls.id} name="classId" defaultValue={cls.id} ariaLabel="Lớp" className="w-full md:w-56" options={classes.map((c) => ({ value: c.id, label: `Lớp ${c.className}`, subtext: c.academicYear.yearName }))} />}
          <MobileCollapse active={sp.termId ? 1 : 0}>{terms.length > 0 && <SearchableSelect key={term?.id ?? ""} name="termId" defaultValue={term?.id ?? ""} ariaLabel="Học kỳ" className="w-full md:w-40" options={terms.map((t) => ({ value: t.id, label: t.termName }))} />}
        </MobileCollapse>
        </AutoForm>
      </Card>
      {tab === "overview" || tab === "students"
        ? <Tabs current={q(tab, "")} items={TABS.map(([k, l]) => [q(k, ""), k === "students" ? `${l} (${roster.length})` : l] as [string, string])} />
        : <h2 className="text-lg font-semibold">{SECTION_TITLE[tab]}</h2>}

      {/* ===================== THỜI KHÓA BIỂU LỚP ===================== */}
      {tab === "timetable" && await (async () => {
        const slots = term ? await loadScheduleSlots({ ...effectiveSlots(), schoolClassId: cls.id, academicTermId: term.id }) : [];
        const periods = [...new Set(slots.map((x) => x.periodNo))].sort((a, b) => a - b);
        const days = [2, 3, 4, 5, 6, 7];
        if (!slots.length) return <Card className="py-10 text-center text-sm text-slate-500">Lớp chưa có thời khóa biểu trong học kỳ này.</Card>;
        return (
          <div className="class-timetable overflow-x-auto bg-white" role="region" aria-label="Thời khóa biểu lớp — vuốt ngang để xem đủ các ngày" tabIndex={0}>
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <caption className="sr-only">Thời khóa biểu lớp: hàng là tiết học, cột là ngày trong tuần</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-16 px-3 py-2.5 text-left font-semibold">Tiết</th>{days.map((d) => <th key={d} className="px-3 py-2.5 text-left font-semibold">Thứ {d}</th>)}</tr></thead>
              <tbody className="[&>tr]:border-t">
                {periods.map((p) => (
                  <tr key={p} className="align-top">
                    <td className="px-3 py-2.5 font-semibold">Tiết {p}</td>
                    {days.map((d) => { const x = slots.find((y) => y.periodNo === p && y.dayOfWeek === d); return (
                      <td key={d} className="px-3 py-2.5">{x ? <><div className="font-medium">{x.assignment.subject.subjectName}</div><div className="text-xs text-slate-500">{x.assignment.teacher.fullName}</div><div className="text-xs text-slate-400">{x.room.roomName}</div></> : <span className="text-slate-300">—</span>}</td>
                    ); })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}


      {/* ===================== TỔNG QUAN ===================== */}
      {tab === "overview" && await (async () => {
        const range = term ? { gte: term.startDate, lte: term.endDate } : undefined;
        const [absent, emu] = await Promise.all([
          db.classPeriodLog.aggregate({ where: { schoolClassId: cls.id, ...(range ? { logDate: range } : {}) }, _sum: { attendanceAbsentCount: true } }),
          db.classEmulationScore.findMany({ where: { schoolClassId: cls.id, ...(term ? { academicTermId: term.id } : {}) }, orderBy: { periodLabel: "desc" }, take: 1 }),
        ]);
        const weak = roster.map((s) => ({ s, avg: studentAvg(s.id) })).filter((x) => x.avg != null && x.avg < 5).sort((a, b) => a.avg! - b.avg!).slice(0, 8);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat icon={Users} label="Sĩ số" value={roster.length} />
              <Stat icon={BarChart3} label="Điểm TB lớp (thang 10)" value={fmt(classAvg)} tone="bg-green-100 text-green-700" />
              <Stat icon={CalendarCheck} label="Lượt vắng trong kỳ" value={absent._sum.attendanceAbsentCount ?? 0} tone="bg-sky-100 text-sky-700" />
              <Stat icon={Trophy} label="Hạng thi đua gần nhất" value={emu[0]?.rank ? `#${emu[0].rank}` : "-"} tone="bg-yellow-100 text-yellow-700" />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-0"><div className="border-b px-4 py-3"><h2 className="font-semibold">Giáo viên bộ môn</h2></div>
                <Table bare mobileLayout="compact" head={["Môn", "Giáo viên", "Điểm TB"]}>
                  {assignments.map((a) => { const v = averages.filter((x) => x.assignmentId === a.id).map((x) => x.averageValue); const m = v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; return <tr key={a.id} className="align-middle"><td className="font-medium">{a.subject.subjectName}</td><td>{a.teacher.fullName}</td><td><b style={{ color: m != null ? bandOf(m).color : undefined }}>{fmt(m)}</b></td></tr>; })}
                  {!assignments.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Chưa phân công giáo viên bộ môn cho học kỳ này.</td></tr>}
                </Table></Card>
              <Card className="p-0"><div className="border-b px-4 py-3"><h2 className="font-semibold">Cần chú ý (điểm TB dưới 5)</h2></div>
                <ul className="divide-y text-sm">
                  {weak.map(({ s, avg }) => <li key={s.id} className="flex items-center gap-3 px-4 py-2.5"><AlertCircle className="size-4 shrink-0 text-red-500" /><Link href={`/hoc-sinh/${s.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-orange-700">{s.fullName}</Link><b className="text-red-600">{fmt(avg)}</b></li>)}
                  {!weak.length && <li className="px-4 py-8 text-center text-slate-500">Không có học sinh nào dưới 5 điểm.</li>}
                </ul></Card>
            </div>
          </div>
        );
      })()}

      {/* ===================== HỌC SINH ===================== */}
      {tab === "students" && (
        <Table mobileLayout="compact" head={["Học sinh", "Ngày sinh", "Phụ huynh", "SĐT phụ huynh", "Điểm TB"]}>
          {roster.map((s) => { const avg = studentAvg(s.id); const band = avg != null ? bandOf(avg) : null; return (
            <tr key={s.id} className="align-middle [&>td]:!py-3">
              <td><Link data-row href={`/hoc-sinh/${s.id}`} className="font-semibold text-orange-700 hover:underline">{s.fullName}</Link><div className="text-xs text-slate-500">{s.code}</div></td>
              <td>{fmtDate(s.dob)}</td><td>{s.guardianName ?? "-"}</td><td>{s.guardianPhone ?? "-"}</td>
              <td>{band ? <span className="font-semibold" style={{ color: band.color }}>{fmt(avg)} <span className="text-xs font-normal text-slate-500">· {band.label}</span></span> : <span className="text-slate-400">—</span>}</td>
            </tr>); })}
          {!roster.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
        </Table>
      )}

      {/* ===================== BẢNG ĐIỂM ===================== */}
      {tab === "scores" && (!assignments.length ? <Card className="py-10 text-center text-sm text-slate-500">Học kỳ này chưa phân công môn học cho lớp.</Card> : (
        <div className="space-y-3">
          <Tabs current={sp.sub === "mon" ? q("scores", "&sub=mon") : q("scores", "")} items={[[q("scores", ""), "Bảng điểm tổng kết"], [q("scores", "&sub=mon"), "Điểm theo môn"]]} />
          {sp.sub !== "mon" && (
        <div className="[&_table]:table-fixed [&_th:first-child]:w-[30%] [&_th:not(:first-child)]:text-center">
          <Table mobileLayout="compact" head={["Học sinh", ...assignments.map((a) => a.subject.subjectName), "TB chung"]}>
            {roster.map((s) => { const avg = studentAvg(s.id); return (
              <tr key={s.id} className="align-middle [&>td]:!py-2.5">
                <td className="whitespace-nowrap"><Link data-row href={`/hoc-sinh/${s.id}`} className="font-semibold text-orange-700 hover:underline">{s.fullName}</Link></td>
                {assignments.map((a) => { const v = cell.get(`${s.id}|${a.id}`); return <td key={a.id} className="text-center">{v != null ? <b style={{ color: bandOf(v).color }}>{fmt(v)}</b> : <span className="text-slate-400">—</span>}</td>; })}
                <td className="text-center">{avg != null ? <b style={{ color: bandOf(avg).color }}>{fmt(avg)}</b> : <span className="text-slate-400">—</span>}</td>
              </tr>); })}
            {!roster.length && <tr><td colSpan={assignments.length + 2} className="py-8 text-center text-slate-500">Lớp chưa có học sinh.</td></tr>}
          </Table>
          </div>
            )}
          {sp.sub === "mon" && !assignments.some((x) => x.id === sp.a) && (
            <div className="[&_table]:table-fixed [&_th:nth-child(1)]:w-[34%] [&_th:nth-child(2)]:w-[34%] [&_th:nth-child(3)]:w-[24%] [&_th:last-child]:text-right [&_td:last-child]:text-right">
              <Table mobileLayout="compact" head={["Môn học", "Giáo viên", "Điểm TB lớp", ""]}>
                {assignments.map((x) => { const v = averages.filter((y) => y.assignmentId === x.id).map((y) => y.averageValue); const m = v.length ? v.reduce((t, n) => t + n, 0) / v.length : null; return (
                  <tr key={x.id} className="align-middle [&>td]:!py-3">
                    <td><Link data-row href={q("scores", `&sub=mon&a=${x.id}`)} className="font-semibold hover:text-orange-700">{x.subject.subjectName}</Link></td>
                    <td>{x.teacher.fullName}</td>
                    <td>{m != null ? <b style={{ color: bandOf(m).color }}>{fmt(m)}</b> : <span className="text-slate-400">—</span>}</td>
                    <td><ChevronRight className="inline size-4 text-slate-400" /></td>
                  </tr>); })}
              </Table>
            </div>
          )}
          {sp.sub === "mon" && assignments.some((x) => x.id === sp.a) && await (async () => {
            const asg = assignments.find((x) => x.id === sp.a)!;
            const entries = await db.scoreEntry.findMany({ where: { assignmentId: asg.id, studentId: { in: ids } }, orderBy: { createdAt: "asc" } });
            const by = (sid: string, t: string) => entries.filter((e) => e.studentId === sid && e.scoreType === t).map((e) => e.value);
            const nTx = Math.max(1, ...roster.map((st) => by(st.id, "THUONG_XUYEN").length));
            const cellV = (v: number | undefined) => v == null ? <span className="text-slate-300">—</span> : <b style={{ color: bandOf(v).color }}>{fmt(v, 1)}</b>;
            return (
              <div className="space-y-2">
                <div className="text-sm text-slate-600"><b className="text-base text-slate-900">{asg.subject.subjectName}</b> · GV {asg.teacher.fullName}</div>
                <div className="[&_table]:table-fixed [&_th:first-child]:w-[26%] [&_th:not(:first-child)]:text-center [&_td:not(:first-child)]:text-center">
                  <Table mobileLayout="compact" head={["Học sinh", ...Array.from({ length: nTx }, (_, i) => `TX${i + 1}`), "Giữa kỳ", "Cuối kỳ", "TB môn"]}>
                    {roster.map((st) => (
                      <tr key={st.id} className="align-middle [&>td]:!py-2.5">
                        <td><Link data-row href={`/hoc-sinh/${st.id}`} className="font-semibold hover:text-orange-700">{st.fullName}</Link></td>
                        {Array.from({ length: nTx }, (_, i) => <td key={i}>{cellV(by(st.id, "THUONG_XUYEN")[i])}</td>)}
                        <td>{cellV(by(st.id, "GIUA_KY")[0])}</td>
                        <td>{cellV(by(st.id, "CUOI_KY")[0])}</td>
                        <td>{(() => { const v = cell.get(`${st.id}|${asg.id}`); return v == null ? <span className="text-slate-300">—</span> : <b style={{ color: bandOf(v).color }}>{fmt(v)}</b>; })()}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              </div>
            );
          })()}
        </div>
      ))}

      {/* ===================== THI ĐUA ===================== */}
      {tab === "emulation" && await (async () => {
        const list = await db.classEmulationScore.findMany({ where: { schoolClassId: cls.id }, orderBy: { periodLabel: "desc" }, include: { academicTerm: true } });
        return (
          <div className="space-y-4">
            {list.length > 0 && <Card><h2 className="mb-4 font-semibold">Điểm thi đua qua các kỳ</h2><ColumnChart items={[...list].reverse().slice(-12).map((x) => ({ label: x.periodLabel.replace(/\s*\(.*\)$/, ""), value: Math.max(0, x.totalScore) }))} /></Card>}
            <Table mobileLayout="compact" head={["Kỳ thi đua", "Học kỳ", "Điểm thi đua", "Hạng toàn trường"]}>
              {list.map((x) => <tr key={x.id}><td className="font-medium">{x.periodLabel}</td><td>{x.academicTerm.termName}</td><td><b>{x.totalScore}</b></td><td>{x.rank ? `#${x.rank}` : "-"}</td></tr>)}
              {!list.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Chưa có dữ liệu thi đua cho lớp này.</td></tr>}
            </Table>
          </div>
        );
      })()}

      {/* ===================== SỔ ĐẦU BÀI ===================== */}
      {tab === "diary" && <ClassWeek me={me} cls={cls} w={sp.w} base={{ tab: "diary", classId: cls.id }} />}

      {/* ===================== KẾT QUẢ CUỐI NĂM ===================== */}
      {tab === "year" && <YearResults classId={cls.id} academicYearId={cls.academicYearId} manager={me.roles.some((role) => MANAGER_ROLES.includes(role))} />}
    </div>
  );
}
