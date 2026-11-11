"use client";

import { useState } from "react";
import { CalendarX, Printer } from "lucide-react";
import { Card, Table } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { buildYearRows, meanOf } from "@/modules/scoring/year-view";

export type AbsenceItem = { id: string; isoDate: string; date: string; termId: string; periodNo: number; subjectName: string; excused: boolean; recent: boolean };

export type ChildData = {
  id: string;
  fullName: string;
  code: string | null;
  dob: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  schoolClass: {
    id: string;
    className: string;
    gradeName: string;
    roomName: string;
    homeroomTeacher: {
      fullName: string;
      phone: string | null;
    } | null;
  } | null;
  yearName: string;
  yearEnd: {
    overallAverage: number | null;
    conductRank: string | null;
    result: string | null;
  } | null;
  absences: AbsenceItem[];
  assessments: Array<{ id: string; academicTermId: string; subjectName: string; outcome: string | null; isExempt: boolean; comment: string | null }>;
  subjectAverages: Array<{
    assignmentId: string;
    subjectId: string;
    termName: string;
    id: string;
    academicTermId: string;
    averageValue: number;
    subjectName: string;
    teacherName: string;
  }>;
  scoreEntries: Array<{
    id: string;
    academicTermId: string;
    assignmentId: string;
    scoreType: "THUONG_XUYEN" | "GIUA_KY" | "CUOI_KY";
    value: number;
  }>;
  scheduleSlots: Array<{
    id: string;
    academicTermId: string;
    dayOfWeek: number;
    periodNo: number;
    subjectName: string;
    teacherName: string;
    roomName: string;
  }>;
  examSeats: Array<{
    id: string;
    eventTitle: string;
    subjectName: string;
    roomName: string;
    registrationNo: string;
    seatNo: number;
    startsAt: string;
    endsAt: string;
  }>;
  loans: Array<{
    id: string;
    bookTitle: string;
    borrowedDate: string;
    dueDate: string;
    isOverdue: boolean;
  }>;
};

export type TermOption = {
  id: string;
  termName: string;
  yearId: string;
  yearName: string;
  isCurrent: boolean;
};

const RESULT_LABELS: Record<string, string> = {
  LEN_LOP: "Lên lớp",
  O_LAI: "Ở lại lớp",
  THI_LAI: "Thi lại trong hè",
};

const TABS = [["grades", "Bảng điểm"], ["schedule", "Thời khóa biểu"], ["absences", "Chuyên cần"], ["exams", "Lịch thi"], ["library", "Thư viện"]] as const;
type TabKey = (typeof TABS)[number][0];
const DAYS = [2, 3, 4, 5, 6, 7];
const PERIODS = [1, 2, 3, 4, 5];
const WEEKDAY = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const Empty = ({ children }: { children: React.ReactNode }) => <Card className="py-10 text-center text-sm text-slate-500">{children}</Card>;
const Badge = ({ tone, children }: { tone: "amber" | "red" | "green"; children: React.ReactNode }) => (
  <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone === "amber" ? "bg-amber-100 text-amber-800" : tone === "red" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-800"}`}>{children}</span>
);

export function ParentPortalView({ childrenData, initialChildId, allTerms, defaultTermId, hiddenTermIds }: { childrenData: ChildData[]; initialChildId: string; allTerms: TermOption[]; defaultTermId: string; hiddenTermIds: string[] }) {
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [selectedTermId, setSelectedTermId] = useState(defaultTermId);
  const [tab, setTab] = useState<TabKey>("grades");
  // Bảng điểm: chọn NĂM HỌC trước, rồi HK1 / HK2 / Cả năm
  const curTerm = allTerms.find((t) => t.id === defaultTermId);
  const [gradeYearId, setGradeYearId] = useState(curTerm?.yearId ?? allTerms[0]?.yearId ?? "");
  const [gradePeriod, setGradePeriod] = useState<"HK1" | "HK2" | "YEAR">(curTerm?.termName === "HK1" || curTerm?.termName === "HK2" ? (curTerm.termName as "HK1" | "HK2") : "YEAR");

  const child = childrenData.find((c) => c.id === selectedChildId) ?? childrenData[0];
  if (!child) return null;

  const gradeYearTerms = allTerms.filter((t) => t.yearId === gradeYearId);
  const gradeTerm = gradePeriod === "YEAR" ? undefined : gradeYearTerms.find((t) => t.termName === gradePeriod);
  const gradeYearHidden = gradeYearTerms.filter((t) => hiddenTermIds.includes(t.id));
  const yearOptions = [...new Map(allTerms.map((t) => [t.yearId, `Năm học ${t.yearName}`])).entries()].map(([value, label]) => ({ value, label }));
  const periodOptions = [{ value: "HK1", label: "Học kỳ 1" }, { value: "HK2", label: "Học kỳ 2" }, { value: "YEAR", label: "Cả năm (HK1 + HK2×2)/3" }];
  const gradeAverages = gradeTerm ? child.subjectAverages.filter((a) => a.academicTermId === gradeTerm.id) : [];
  const yearRows = gradePeriod === "YEAR" ? buildYearRows(child.subjectAverages.filter((a) => gradeYearTerms.some((t) => t.id === a.academicTermId)).map((a) => ({ subjectId: a.subjectId, subjectName: a.subjectName, termName: a.termName, value: a.averageValue }))) : [];
  const isAll = selectedTermId === "ALL";
  const inTerm = (termId: string) => isAll || termId === selectedTermId;
  const averages = child.subjectAverages.filter((a) => inTerm(a.academicTermId));
  const slots = child.scheduleSlots.filter((s) => inTerm(s.academicTermId));
  const absences = child.absences.filter((a) => inTerm(a.termId));
  const excused = absences.filter((a) => a.excused).length;
  const recent = child.absences.filter((a) => a.recent);
  const recentDays = [...new Set(recent.map((a) => a.isoDate))].sort().reverse();
  const count: Partial<Record<TabKey, number>> = { absences: absences.length, exams: child.examSeats.length, library: child.loans.length };
  const termOptions = [{ value: "ALL", label: "Tất cả học kỳ" }, ...allTerms.map((t) => ({ value: t.id, label: `${t.termName} · ${t.yearName}${t.isCurrent ? " (hiện tại)" : ""}` }))];
  const termPicker = (
    <div className="no-print w-full sm:w-72"><SearchableSelect name="term" options={termOptions} value={selectedTermId} onChange={setSelectedTermId} ariaLabel="Học kỳ" /></div>
  );
  const info = (label: string, value: React.ReactNode) => (
    <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt><dd className="font-medium">{value}</dd></div>
  );

  return (
    <div className="space-y-4">
      {childrenData.length > 1 && (
        <div className="no-print flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Chọn con:</span>
          {childrenData.map((c) => (
            <button key={c.id} type="button" onClick={() => setSelectedChildId(c.id)} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 ${c.id === selectedChildId ? "border-orange-600 bg-orange-600 text-white" : "bg-white hover:bg-slate-50"}`}>
              {c.fullName}<span className={c.id === selectedChildId ? "text-orange-100" : "text-slate-500"}>{c.schoolClass?.className ?? "Chưa xếp lớp"}</span>
            </button>
          ))}
        </div>
      )}

      <Card mobile="flat" className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-orange-100 text-2xl font-bold text-orange-700">{child.fullName.split(" ").pop()?.[0]}</span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight">{child.fullName}</h1>
              <p className="text-sm text-slate-500">{child.code ? `Mã HS ${child.code}` : ""}{child.schoolClass ? ` · Lớp ${child.schoolClass.className} (${child.schoolClass.gradeName})` : " · Chưa xếp lớp"}</p>
            </div>
          </div>
          <button type="button" onClick={() => window.print()} className="no-print inline-flex h-9 shrink-0 items-center gap-2 rounded-md border bg-white px-3 text-sm hover:bg-slate-50"><Printer className="size-4" /><span className="hidden sm:inline">In sổ liên lạc</span></button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 text-sm lg:grid-cols-4">
          {info("Năm học · Phòng", `${child.yearName}${child.schoolClass ? ` · ${child.schoolClass.roomName}` : ""}`)}
          {info("Giáo viên chủ nhiệm", child.schoolClass?.homeroomTeacher ? <>{child.schoolClass.homeroomTeacher.fullName}{child.schoolClass.homeroomTeacher.phone && <a href={`tel:${child.schoolClass.homeroomTeacher.phone}`} className="block text-xs font-normal text-orange-700 hover:underline">{child.schoolClass.homeroomTeacher.phone}</a>}</> : "Chưa phân công")}
          {info("Người giám hộ", <>{child.guardianName || "—"}<span className="block text-xs font-normal text-slate-500">{child.guardianPhone || ""}</span></>)}
          {info("Đánh giá năm học", child.yearEnd ? <>TB {child.yearEnd.overallAverage?.toFixed(1) ?? "—"}{child.yearEnd.conductRank ? ` · Rèn luyện ${child.yearEnd.conductRank}` : ""}<span className="block text-xs font-normal text-green-700">{child.yearEnd.result ? RESULT_LABELS[child.yearEnd.result] ?? child.yearEnd.result : ""}</span></> : <span className="font-normal text-slate-500">Đang theo học</span>)}
        </dl>
      </Card>

      {recentDays.length > 0 && (
        <button type="button" onClick={() => setTab("absences")} className="no-print flex w-full items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-left text-sm text-red-800">
          <CalendarX className="mt-0.5 size-4 shrink-0" />
          <span><b>Con có nghỉ học trong 7 ngày gần đây</b>: {recent.length} tiết vắng, ngày {recentDays.map((d) => d.split("-").reverse().slice(0, 2).join("/")).join(", ")}. Bấm để xem chi tiết.</span>
        </button>
      )}

      <div className="no-print flex gap-0.5 overflow-x-auto border-b sm:gap-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`-mb-px flex-1 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] sm:flex-none sm:text-sm ${tab === key ? "border-orange-600 font-semibold text-orange-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}{count[key] ? <span className={`ml-1.5 rounded px-1.5 text-[11px] ${key === "absences" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{count[key]}</span> : null}
          </button>
        ))}
      </div>

      {tab === "grades" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Điểm các môn</h2>
            <div className="no-print flex w-full flex-wrap gap-2 sm:w-auto">
              <div className="w-full sm:w-56"><SearchableSelect name="gyear" options={yearOptions} value={gradeYearId} onChange={setGradeYearId} ariaLabel="Năm học" /></div>
              <div className="w-full sm:w-64"><SearchableSelect name="gperiod" options={periodOptions} value={gradePeriod} onChange={(v) => setGradePeriod(v as "HK1" | "HK2" | "YEAR")} ariaLabel="Học kỳ" /></div>
            </div>
          </div>
          {gradeYearHidden.length > 0 && (gradePeriod === "YEAR" || (gradeTerm && gradeYearHidden.some((t) => t.id === gradeTerm.id))) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{gradePeriod === "YEAR" ? `Điểm ${gradeYearHidden.map((t) => t.termName).join(", ")} chưa được công bố nên chưa hiển thị và chưa tính điểm cả năm.` : "Điểm học kỳ này chưa được công bố. Nhà trường sẽ thông báo khi điểm được công bố."}</div>
          )}
          {gradePeriod === "YEAR" ? (
            yearRows.length === 0 ? <Empty>Chưa có điểm trong năm học này.</Empty> : (
              <Table mobileLayout="compact" head={["Môn học", "HK1", "HK2", "Cả năm"]}>
                {yearRows.map((r) => <tr key={r.subjectId} className="align-middle"><td className="font-semibold">{r.subjectName}</td><td>{r.hk1?.toFixed(1) ?? "—"}</td><td>{r.hk2?.toFixed(1) ?? "—"}</td><td className="font-semibold text-orange-700">{r.year != null ? r.year.toFixed(1) : "—"}</td></tr>)}
                <tr className="bg-slate-50 font-semibold"><td>Trung bình các môn</td><td>{meanOf(yearRows.map((r) => r.hk1)) ?? "—"}</td><td>{meanOf(yearRows.map((r) => r.hk2)) ?? "—"}</td><td className="text-orange-700">{meanOf(yearRows.map((r) => r.year))?.toFixed(1) ?? "—"}</td></tr>
              </Table>
            )
          ) : gradeAverages.length === 0 ? <Empty>{gradeTerm && gradeYearHidden.some((t) => t.id === gradeTerm.id) ? "Điểm học kỳ này chưa được công bố." : "Chưa có điểm môn học nào trong học kỳ này."}</Empty> : (
            <Table mobileLayout="compact" head={["Môn học", "Giáo viên", "Thường xuyên", "Giữa kỳ", "Cuối kỳ", "TB môn"]}>
              {gradeAverages.map((avg) => {
                const own = child.scoreEntries.filter((e) => e.academicTermId === avg.academicTermId && e.assignmentId === avg.assignmentId);
                const tx = own.filter((e) => e.scoreType === "THUONG_XUYEN").map((e) => e.value.toFixed(1)).join(", ");
                const one = (t: "GIUA_KY" | "CUOI_KY") => own.find((e) => e.scoreType === t)?.value.toFixed(1) ?? "—";
                return <tr key={avg.id} className="align-middle"><td className="font-semibold">{avg.subjectName}</td><td>{avg.teacherName}</td><td>{tx || "—"}</td><td>{one("GIUA_KY")}</td><td>{one("CUOI_KY")}</td><td className="font-semibold text-orange-700">{avg.averageValue.toFixed(1)}</td></tr>;
              })}
              <tr className="bg-slate-50 font-semibold"><td colSpan={5} className="text-right">Điểm trung bình học kỳ</td><td className="text-orange-700">{(gradeAverages.reduce((t, a) => t + a.averageValue, 0) / gradeAverages.length).toFixed(2)}</td></tr>
            </Table>
          )}
        </div>
      )}

      {tab === "schedule" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Thời khóa biểu lớp {child.schoolClass?.className ?? ""}</h2>{termPicker}</div>
          {slots.length === 0 ? <Empty>Lớp của con chưa có thời khóa biểu trong học kỳ này.</Empty> : (
            <div className="content-panel overflow-x-auto rounded-lg border bg-white">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="bg-slate-50"><th className="w-16 border-b px-2 py-2">Tiết</th>{DAYS.map((d) => <th key={d} className="border-b px-2 py-2 text-left">Thứ {d}</th>)}</tr></thead>
                <tbody>{PERIODS.map((p) => (
                  <tr key={p}><td className="border-b px-2 py-2 text-center text-slate-500">{p}</td>
                    {DAYS.map((d) => { const s = slots.find((x) => x.dayOfWeek === d && x.periodNo === p); return <td key={d} className="border-b border-l px-2 py-1.5 align-top">{s ? <><div className="font-medium text-orange-700">{s.subjectName}</div><div className="text-xs text-slate-500">{s.teacherName} · {s.roomName}</div></> : null}</td>; })}
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "absences" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Tình hình chuyên cần</h2><p className="text-xs text-slate-500">Theo điểm danh của giáo viên trong sổ đầu bài từng tiết.</p></div>{termPicker}</div>
          <div className="grid grid-cols-3 gap-3">
            {([["Tổng tiết vắng", absences.length, ""], ["Có phép", excused, "text-amber-700"], ["Không phép", absences.length - excused, "text-red-700"]] as const).map(([label, value, tone]) => (
              <Card key={label} className="p-3"><div className="text-xs text-slate-500">{label}</div><div className={`text-2xl font-semibold ${tone}`}>{value}</div></Card>
            ))}
          </div>
          {absences.length === 0 ? <Empty>Con đi học đầy đủ, chưa có tiết vắng nào trong thời gian này.</Empty> : (
            <Table mobileLayout="compact" head={["Ngày", "Tiết", "Môn", "Trạng thái"]}>
              {absences.map((a) => <tr key={a.id} className="align-middle"><td>{WEEKDAY[new Date(a.isoDate + "T00:00:00Z").getUTCDay()]}, {a.date}</td><td>Tiết {a.periodNo}</td><td>{a.subjectName}</td><td><Badge tone={a.excused ? "amber" : "red"}>{a.excused ? "Có phép" : "Không phép"}</Badge></td></tr>)}
            </Table>
          )}
        </div>
      )}

      {tab === "exams" && (
        <div className="space-y-3">
          <div><h2 className="font-semibold">Lịch thi của con</h2><p className="text-xs text-slate-500">Nhắc con ôn tập và đến đúng giờ theo số báo danh, phòng thi.</p></div>
          {child.examSeats.length === 0 ? <Empty>Hiện chưa có lịch thi nào được công bố cho con.</Empty> : (
            <Table mobileLayout="compact" head={["Môn", "Kỳ thi", "Giờ thi", "Phòng", "SBD", "Ghế"]}>
              {child.examSeats.map((x) => <tr key={x.id} className="align-middle"><td className="font-semibold">{x.subjectName}</td><td>{x.eventTitle}</td><td>{x.startsAt}{x.endsAt ? ` – ${x.endsAt}` : ""}</td><td>{x.roomName}</td><td>{x.registrationNo}</td><td>{x.seatNo}</td></tr>)}
            </Table>
          )}
        </div>
      )}

      {tab === "library" && (
        <div className="space-y-3">
          <div><h2 className="font-semibold">Sách đang mượn</h2><p className="text-xs text-slate-500">Các đầu sách con đang mượn từ thư viện nhà trường.</p></div>
          {child.loans.length === 0 ? <Empty>Con hiện không mượn sách nào hoặc đã trả đủ.</Empty> : (
            <Table mobileLayout="compact" head={["Sách", "Ngày mượn", "Hạn trả", "Trạng thái"]}>
              {child.loans.map((l) => <tr key={l.id} className="align-middle"><td className="font-semibold">{l.bookTitle}</td><td>{l.borrowedDate}</td><td className={l.isOverdue ? "font-semibold text-red-700" : ""}>{l.dueDate}</td><td><Badge tone={l.isOverdue ? "red" : "green"}>{l.isOverdue ? "Quá hạn" : "Đang mượn"}</Badge></td></tr>)}
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
