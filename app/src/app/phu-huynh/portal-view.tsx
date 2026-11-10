"use client";

import { useState } from "react";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  GraduationCap,
  Phone,
  Printer,
  ShieldAlert,
  User,
  Users,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

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
    overallAverage: number;
    conductRank: string | null;
    result: string | null;
  } | null;
  subjectAverages: Array<{
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
  periodLogs: Array<{
    id: string;
    logDate: string;
    subjectName: string;
    teacherName: string;
    periodNo: number;
    conductRating: string | null;
    attendanceAbsentCount: number;
    note: string | null;
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
  yearName: string;
  isCurrent: boolean;
};

const RESULT_LABELS: Record<string, string> = {
  LEN_LOP: "Lên lớp",
  O_LAI: "Ở lại lớp",
  THI_LAI: "Thi lại trong hè",
};

export function ParentPortalView({
  childrenData,
  initialChildId,
  allTerms,
  defaultTermId,
}: {
  childrenData: ChildData[];
  initialChildId: string;
  allTerms: TermOption[];
  defaultTermId: string;
}) {
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [selectedTermId, setSelectedTermId] = useState(defaultTermId);
  const [activeTab, setActiveTab] = useState<"grades" | "schedule" | "conduct" | "exams" | "library">("grades");

  const child = childrenData.find((c) => c.id === selectedChildId) ?? childrenData[0];
  if (!child) return null;

  // Lọc điểm theo học kỳ được chọn trong dropdown
  const isAllTerms = selectedTermId === "ALL";
  const filteredAverages = isAllTerms
    ? child.subjectAverages
    : child.subjectAverages.filter((avg) => avg.academicTermId === selectedTermId);

  const filteredEntries = isAllTerms
    ? child.scoreEntries
    : child.scoreEntries.filter((e) => e.academicTermId === selectedTermId);

  // Lọc thời khóa biểu theo học kỳ
  const filteredSchedule = child.scheduleSlots.filter(
    (s) => isAllTerms || s.academicTermId === selectedTermId
  );
  const scheduleDays = [2, 3, 4, 5, 6, 7]; // Thứ 2 - Thứ 7
  const schedulePeriods = [1, 2, 3, 4, 5]; // Tiết 1 - Tiết 5

  // Thống kê nề nếp / vi phạm
  const totalAbsent = child.periodLogs.reduce((sum, log) => sum + log.attendanceAbsentCount, 0);
  const logsWithNotes = child.periodLogs.filter((log) => log.note && log.note.trim() !== "");

  // Điểm trung bình học kỳ được chọn
  const termAvg =
    filteredAverages.length > 0
      ? (
          filteredAverages.reduce((sum, a) => sum + a.averageValue, 0) /
          filteredAverages.length
        ).toFixed(2)
      : null;

  return (
    <div className="space-y-6">
      {/* 1. CHỌN CON (NẾU CÓ NHIỀU CON) */}
      {childrenData.length > 1 && (
        <div className="no-print rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4 shadow-xs">
          <div className="flex items-center gap-2 mb-2.5 px-1">
            <Users className="size-4 text-orange-600 dark:text-orange-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Chọn con để xem sổ liên lạc ({childrenData.length} học sinh):
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {childrenData.map((c) => {
              const active = c.id === selectedChildId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedChildId(c.id)}
                  type="button"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                    active
                      ? "bg-orange-600 text-white shadow-md shadow-orange-600/25"
                      : "border border-[var(--line)] bg-[var(--bg)] text-[var(--fg)] hover:border-orange-500/50 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                  }`}
                >
                  <User className="size-3.5" />
                  <span>{c.fullName}</span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${
                      active
                        ? "bg-orange-700/80 text-white"
                        : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {c.schoolClass?.className ?? "Chưa xếp lớp"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. THẺ HỒ SƠ HỌC SINH & LỚP CỦA CON */}
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid size-16 sm:size-20 shrink-0 place-items-center rounded-2xl bg-orange-100 dark:bg-orange-950/60 font-bold text-orange-600 dark:text-orange-400 text-2xl sm:text-3xl shadow-xs ring-4 ring-orange-500/10">
              {child.fullName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--fg)]">
                  {child.fullName}
                </h1>
                {child.code && (
                  <span className="rounded-full bg-orange-100 dark:bg-orange-950/60 px-3 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-400">
                    Mã HS: {child.code}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {child.schoolClass ? (
                  <>
                    Lớp <strong>{child.schoolClass.className}</strong> ({child.schoolClass.gradeName}) · Phòng <strong>{child.schoolClass.roomName}</strong> · Năm học {child.yearName}
                  </>
                ) : (
                  "Chưa xếp lớp"
                )}
                {child.dob && ` · Sinh ngày: ${child.dob}`}
              </p>
            </div>
          </div>

          <div className="no-print flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <Printer className="size-3.5" /> In sổ liên lạc
            </button>
          </div>
        </div>

        {/* 3 Thông tin nổi bật: GVCN, Giám hộ, Kết quả năm học */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 border-t border-[var(--line)] pt-5 text-xs">
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--bg)] p-3.5 border border-[var(--line)]">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
              <GraduationCap className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Giáo viên chủ nhiệm:</div>
              <div className="font-semibold text-sm text-[var(--fg)] truncate">
                {child.schoolClass?.homeroomTeacher?.fullName ?? "Chưa phân công"}
              </div>
              {child.schoolClass?.homeroomTeacher?.phone && (
                <a
                  href={`tel:${child.schoolClass.homeroomTeacher.phone}`}
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                >
                  <Phone className="size-3" />
                  {child.schoolClass.homeroomTeacher.phone}
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-[var(--bg)] p-3.5 border border-[var(--line)]">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <User className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Người giám hộ đã đăng ký:</div>
              <div className="font-semibold text-sm text-[var(--fg)] truncate">
                {child.guardianName || "Phụ huynh"}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                SĐT: {child.guardianPhone || "—"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-[var(--bg)] p-3.5 border border-[var(--line)] sm:col-span-2 lg:col-span-1">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Award className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Đánh giá năm học:</div>
              <div className="font-semibold text-sm text-[var(--fg)]">
                {child.yearEnd ? (
                  <>
                    TB Cả năm: <span className="font-bold text-orange-600 dark:text-orange-400">{child.yearEnd.overallAverage.toFixed(1)}</span>
                    {child.yearEnd.conductRank && ` · HK: ${child.yearEnd.conductRank}`}
                  </>
                ) : (
                  "Đang cập nhật kết quả"
                )}
              </div>
              <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {child.yearEnd?.result ? RESULT_LABELS[child.yearEnd.result] ?? child.yearEnd.result : "Đang học"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. THANH TAB ĐIỀU HƯỚNG NỘI DUNG */}
      <div className="no-print flex items-center gap-1.5 sm:gap-2 overflow-x-auto border-b border-[var(--line)] pb-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("grades")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 transition whitespace-nowrap ${
            activeTab === "grades"
              ? "bg-orange-600 text-white shadow-sm"
              : "border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Award className="size-4" />
          <span>Bảng điểm môn học</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 transition whitespace-nowrap ${
            activeTab === "schedule"
              ? "bg-orange-600 text-white shadow-sm"
              : "border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Calendar className="size-4" />
          <span>Thời khóa biểu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("conduct")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 transition whitespace-nowrap ${
            activeTab === "conduct"
              ? "bg-orange-600 text-white shadow-sm"
              : "border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <ShieldAlert className="size-4" />
          <span>Nề nếp & Chuyên cần</span>
          {totalAbsent > 0 && (
            <span className="rounded-full bg-red-100 dark:bg-red-900/60 px-1.5 py-0.2 text-[10px] text-red-600 dark:text-red-300">
              {totalAbsent} vắng
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("exams")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 transition whitespace-nowrap ${
            activeTab === "exams"
              ? "bg-orange-600 text-white shadow-sm"
              : "border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <FileText className="size-4" />
          <span>Lịch thi của con</span>
          {child.examSeats.length > 0 && (
            <span className="rounded-full bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.2 text-[10px] text-blue-600 dark:text-blue-300">
              {child.examSeats.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("library")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 transition whitespace-nowrap ${
            activeTab === "library"
              ? "bg-orange-600 text-white shadow-sm"
              : "border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <BookOpen className="size-4" />
          <span>Mượn sách thư viện</span>
          {child.loans.length > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.2 text-[10px] text-amber-700 dark:text-amber-300">
              {child.loans.length}
            </span>
          )}
        </button>
      </div>

      {/* 4. NỘI DUNG TỪNG TAB */}

      {/* TAB 1: BẢNG ĐIỂM MÔN HỌC (CÓ DROPDOWN CHỌN HỌC KỲ) */}
      {activeTab === "grades" && (
        <div className="space-y-4">
          {/* Thanh công cụ: Chọn học kỳ */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-bold text-[var(--fg)]">
                Bảng điểm môn học:
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Chọn học kỳ:
              </label>
              <div className="relative">
                <select
                  value={selectedTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                  className="h-9 rounded-xl border border-[var(--line)] bg-[var(--bg)] pl-3 pr-8 text-xs font-semibold text-[var(--fg)] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                >
                  {allTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.termName} — {t.yearName} {t.isCurrent ? "(Học kỳ hiện tại)" : ""}
                    </option>
                  ))}
                  <option value="ALL">Tất cả các học kỳ</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Bảng điểm chi tiết */}
          {filteredAverages.length === 0 ? (
            <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-12 text-center text-slate-500">
              Chưa có dữ liệu điểm môn học nào được ghi nhận cho học kỳ này.
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[var(--line)] bg-slate-50/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5 font-bold">Môn học</th>
                      <th className="px-4 py-3.5 font-bold">Giáo viên bộ môn</th>
                      <th className="px-4 py-3.5 font-bold">Điểm Thường Xuyên (TX)</th>
                      <th className="px-4 py-3.5 font-bold text-center">Giữa Kỳ (GK)</th>
                      <th className="px-4 py-3.5 font-bold text-center">Cuối Kỳ (CK)</th>
                      <th className="px-5 py-3.5 font-bold text-center">Điểm TB Môn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {filteredAverages.map((avg) => {
                      const subjectEntries = filteredEntries.filter(
                        (e) => e.academicTermId === avg.academicTermId
                      );
                      const tx = subjectEntries
                        .filter((e) => e.scoreType === "THUONG_XUYEN")
                        .map((e) => e.value.toFixed(1))
                        .join(", ");
                      const gk =
                        subjectEntries.find((e) => e.scoreType === "GIUA_KY")?.value?.toFixed(1) ?? "—";
                      const ck =
                        subjectEntries.find((e) => e.scoreType === "CUOI_KY")?.value?.toFixed(1) ?? "—";

                      return (
                        <tr
                          key={avg.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="px-5 py-3.5 font-bold text-sm text-[var(--fg)]">
                            {avg.subjectName}
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                            {avg.teacherName}
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300 font-medium">
                            {tx || "—"}
                          </td>
                          <td className="px-4 py-3.5 text-center font-semibold text-slate-800 dark:text-slate-200">
                            {gk}
                          </td>
                          <td className="px-4 py-3.5 text-center font-semibold text-slate-800 dark:text-slate-200">
                            {ck}
                          </td>
                          <td className="px-5 py-3.5 text-center font-bold text-base text-orange-600 dark:text-orange-400">
                            {avg.averageValue.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {termAvg && (
                    <tfoot className="border-t-2 border-[var(--line)] bg-[var(--bg)] font-bold">
                      <tr>
                        <td colSpan={5} className="px-5 py-3.5 text-right text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          Điểm Trung Bình Học Kỳ:
                        </td>
                        <td className="px-5 py-3.5 text-center text-lg font-bold text-orange-600 dark:text-orange-400">
                          {termAvg}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: THỜI KHÓA BIỂU CỦA CON */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-[var(--fg)]">
                Thời khóa biểu tuần của lớp {child.schoolClass?.className ?? ""}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Giúp phụ huynh nắm lịch học hàng ngày để chuẩn bị sách vở và đưa đón con.
              </p>
            </div>
            {child.schoolClass?.roomName && (
              <span className="rounded-xl bg-orange-100 dark:bg-orange-950/60 px-3 py-1 text-xs font-semibold text-orange-700 dark:text-orange-400">
                Phòng học: {child.schoolClass.roomName}
              </span>
            )}
          </div>

          {filteredSchedule.length === 0 ? (
            <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-12 text-center text-slate-500">
              Lớp của con chưa có thời khóa biểu được áp dụng trong học kỳ này.
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-xs table-fixed">
                  <thead className="border-b border-[var(--line)] bg-slate-50/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="w-16 px-4 py-3.5 text-center font-bold">Tiết</th>
                      {scheduleDays.map((d) => (
                        <th key={d} className="px-3 py-3.5 text-left font-bold">
                          Thứ {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {schedulePeriods.map((p) => (
                      <tr key={p} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                        <td className="px-4 py-3.5 text-center font-bold text-slate-500 bg-[var(--bg)]/50">
                          Tiết {p}
                        </td>
                        {scheduleDays.map((d) => {
                          const slot = filteredSchedule.find(
                            (s) => s.dayOfWeek === d && s.periodNo === p
                          );
                          return (
                            <td key={d} className="px-3 py-3 align-top border-l border-[var(--line)]">
                              {slot ? (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-sm text-[var(--fg)]">
                                    {slot.subjectName}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {slot.teacherName}
                                  </div>
                                  <div className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">
                                    {slot.roomName}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: NỀ NẾP & CHUYÊN CẦN / VI PHẠM */}
      {activeTab === "conduct" && (
        <div className="space-y-4">
          {/* Thống kê nhanh chuyên cần */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                  <Clock className="size-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Tổng lượt vắng ghi nhận trong các tiết:</div>
                  <div className="text-xl font-bold text-[var(--fg)]">
                    {totalAbsent > 0 ? (
                      <span className="text-red-600 dark:text-red-400">{totalAbsent} lượt</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">0 lượt (Chuyên cần tốt)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
                  <Award className="size-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Hạnh kiểm / Rèn luyện năm học:</div>
                  <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                    {child.yearEnd?.conductRank ?? "Tốt"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sổ đầu bài & Nhắc nhở của giáo viên */}
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-bold flex items-center gap-2 text-[var(--fg)]">
                <FileText className="size-4 text-orange-600 dark:text-orange-400" />
                Theo dõi nề nếp tiết học & Nhắc nhở của giáo viên (Sổ đầu bài)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ghi chép từ giáo viên bộ môn về ý thức học tập, việc học bài cũ và nề nếp của lớp con.
              </p>
            </div>

            {child.periodLogs.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Chưa có nhật ký tiết học nào được ghi nhận gần đây.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[var(--line)] bg-slate-50/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-bold">Ngày</th>
                      <th className="px-4 py-3 font-bold">Môn học</th>
                      <th className="px-4 py-3 font-bold">Giáo viên</th>
                      <th className="px-4 py-3 font-bold text-center">Xếp loại tiết</th>
                      <th className="px-4 py-3 font-bold text-center">Vắng</th>
                      <th className="px-4 py-3 font-bold">Nhận xét của giáo viên</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {child.periodLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{log.logDate}</td>
                        <td className="px-4 py-3 font-bold text-[var(--fg)]">{log.subjectName}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{log.teacherName}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              log.conductRating === "TOT"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : log.conductRating === "KHA"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {log.conductRating ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-medium">
                          {log.attendanceAbsentCount > 0 ? (
                            <span className="text-red-600 dark:text-red-400 font-bold">
                              {log.attendanceAbsentCount} em
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {log.note ? (
                            <span className="italic">{log.note}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: LỊCH THI CỦA CON */}
      {activeTab === "exams" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-xs">
            <h3 className="text-sm font-bold text-[var(--fg)]">Lịch thi các kỳ thi chính thức</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Phụ huynh nhắc nhở con ôn tập và đi thi đúng giờ theo số báo danh và phòng thi quy định.
            </p>
          </div>

          {child.examSeats.length === 0 ? (
            <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-12 text-center text-slate-500">
              Hiện tại học sinh chưa có lịch thi nào được công bố.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {child.examSeats.map((seat) => (
                <div
                  key={seat.id}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-orange-100 dark:bg-orange-950/60 px-2.5 py-1 text-xs font-bold text-orange-700 dark:text-orange-400">
                      {seat.subjectName}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {seat.eventTitle}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--bg)] p-3 text-center border border-[var(--line)]">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">Phòng thi</div>
                      <div className="text-sm font-bold text-[var(--fg)]">{seat.roomName}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">Số báo danh</div>
                      <div className="text-sm font-bold text-orange-600 dark:text-orange-400">
                        {seat.registrationNo}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">Vị trí ghế</div>
                      <div className="text-sm font-bold text-[var(--fg)]">Ghế {seat.seatNo}</div>
                    </div>
                  </div>

                  {(seat.startsAt || seat.endsAt) && (
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Clock className="size-3.5 text-orange-600 dark:text-orange-400" />
                      <span>Ca thi: <strong>{seat.startsAt}</strong> – <strong>{seat.endsAt}</strong></span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: MƯỢN SÁCH THƯ VIỆN */}
      {activeTab === "library" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-xs">
            <h3 className="text-sm font-bold text-[var(--fg)]">Tình hình mượn trả sách thư viện</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Theo dõi các đầu sách học sinh đang mượn từ thư viện nhà trường.
            </p>
          </div>

          {child.loans.length === 0 ? (
            <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-12 text-center text-slate-500">
              Học sinh hiện không mượn sách thư viện nào hoặc đã hoàn trả đầy đủ.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {child.loans.map((loan, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl border p-4 shadow-xs space-y-2 ${
                    loan.isOverdue
                      ? "border-red-300 dark:border-red-900 bg-red-50/60 dark:bg-red-950/20"
                      : "border-[var(--line)] bg-[var(--surface)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm text-[var(--fg)]">{loan.bookTitle}</div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${
                        loan.isOverdue
                          ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {loan.isOverdue ? "ĐÃ QUÁ HẠN" : "ĐANG MƯỢN"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center justify-between pt-1 border-t border-[var(--line)]">
                    <span>Mượn: {loan.borrowedDate}</span>
                    <span className={loan.isOverdue ? "text-red-600 font-bold" : ""}>
                      Hạn trả: {loan.dueDate}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
