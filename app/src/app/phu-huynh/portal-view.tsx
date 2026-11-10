"use client";

import { ToolbarActions } from "@/components/toolbar-actions";
import { useState } from "react";
import {
  Award,
  BookOpen,
  Calendar,
  ChevronDown,
  Clock,
  FileText,
  GraduationCap,
  Phone,
  Printer,
  User,
  Users,
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
    overallAverage: number | null;
    conductRank: string | null;
    result: string | null;
  } | null;
  assessments: Array<{ id: string; academicTermId: string; subjectName: string; outcome: string | null; isExempt: boolean; comment: string | null }>;
  subjectAverages: Array<{
    assignmentId: string;
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
  const [activeTab, setActiveTab] = useState<"grades" | "schedule" | "exams" | "library">("grades");

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
      {/* 1. CHỌN CON (NẾU CÓ NHIỀU CON CÙNG HỌC TRƯỜNG) */}
      {childrenData.length > 1 && (
        <div className="content-panel no-print rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-xs">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Users className="size-4 text-orange-600 dark:text-orange-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
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
                      : "border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <User className="size-3.5" />
                  <span>{c.fullName}</span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${
                      active
                        ? "bg-orange-700 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
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
      <div className="content-panel rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid size-16 sm:size-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 font-bold text-white text-2xl sm:text-3xl shadow-md shadow-orange-600/20 ring-4 ring-orange-500/10">
              {child.fullName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {child.fullName}
                </h1>
                {child.code && (
                  <span className="rounded-full bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60 px-3 py-0.5 text-xs font-semibold">
                    Mã HS: {child.code}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {child.schoolClass ? (
                  <>
                    Lớp <strong className="text-slate-900 dark:text-slate-100">{child.schoolClass.className}</strong> ({child.schoolClass.gradeName}) · Phòng <strong className="text-slate-900 dark:text-slate-100">{child.schoolClass.roomName}</strong> · Năm học {child.yearName}
                  </>
                ) : (
                  "Chưa xếp lớp"
                )}
                {child.dob && ` · Sinh ngày: ${child.dob}`}
              </p>
            </div>
          </div>

          <div className="no-print flex items-center gap-2 self-end sm:self-auto">
            <ToolbarActions label="Tùy chọn sổ liên lạc">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              <Printer className="size-3.5" /> In sổ liên lạc
            </button>
            </ToolbarActions>
          </div>
        </div>

        {/* 3 Thẻ thông tin nổi bật: GVCN, Giám hộ, Kết quả năm học */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 border-t border-slate-100 dark:border-slate-800 pt-5 text-xs">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700/80">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
              <GraduationCap className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Giáo viên chủ nhiệm:</div>
              <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
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

          <div className="flex items-center gap-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700/80">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <User className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Người giám hộ đã đăng ký:</div>
              <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                {child.guardianName || "Phụ huynh"}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                SĐT: {child.guardianPhone || "—"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 p-4 border border-slate-200/80 dark:border-slate-700/80 sm:col-span-2 lg:col-span-1">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Award className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Đánh giá năm học:</div>
              <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                {child.yearEnd ? (
                  <>
                    TB Cả năm: <span className="font-bold text-orange-600 dark:text-orange-400">{child.yearEnd.overallAverage?.toFixed(1) ?? "—"}</span>
                    {child.yearEnd.conductRank && ` · Rèn luyện: ${child.yearEnd.conductRank}`}
                  </>
                ) : (
                  "Đang cập nhật kết quả"
                )}
              </div>
              <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                {child.yearEnd?.result ? RESULT_LABELS[child.yearEnd.result] ?? child.yearEnd.result : "Đang theo học"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. THANH TAB ĐIỀU HƯỚNG NỘI DUNG */}
      <div className="no-print flex items-center gap-1.5 sm:gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("grades")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 transition whitespace-nowrap ${
            activeTab === "grades"
              ? "bg-orange-600 text-white shadow-sm"
              : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
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
              : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          }`}
        >
          <Calendar className="size-4" />
          <span>Thời khóa biểu</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("exams")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 transition whitespace-nowrap ${
            activeTab === "exams"
              ? "bg-orange-600 text-white shadow-sm"
              : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
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
              : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
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
          <div className="content-panel flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Bảng điểm môn học:
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                Chọn học kỳ:
              </label>
              <div className="relative">
                <select
                  value={selectedTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-3 pr-8 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
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

          {child.assessments.filter((review) => selectedTermId === "ALL" || review.academicTermId === selectedTermId).length > 0 && <div className="content-panel rounded-xl border bg-white p-4"><h3 className="mb-3 text-sm font-semibold">Kết quả nhận xét theo môn</h3><ul className="divide-y text-sm">{child.assessments.filter((review) => selectedTermId === "ALL" || review.academicTermId === selectedTermId).map((review) => <li key={review.id} className="py-2"><b>{review.subjectName}</b>: {review.isExempt ? "Miễn đánh giá" : review.outcome === "DAT" ? "Đạt" : review.outcome === "CHUA_DAT" ? "Chưa đạt" : "Chưa đánh giá"}{review.comment && <p className="mt-1 text-xs text-slate-500">{review.comment}</p>}</li>)}</ul></div>}
          {/* Bảng điểm chi tiết */}
          {filteredAverages.length === 0 ? (
            <div className="content-panel rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-slate-500">
              Chưa có dữ liệu điểm môn học nào được ghi nhận cho học kỳ này.
            </div>
          ) : (
            <div className="content-panel overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5 font-bold">Môn học</th>
                      <th className="px-4 py-3.5 font-bold">Giáo viên bộ môn</th>
                      <th className="px-4 py-3.5 font-bold">Điểm Thường Xuyên (TX)</th>
                      <th className="px-4 py-3.5 font-bold text-center">Giữa Kỳ (GK)</th>
                      <th className="px-4 py-3.5 font-bold text-center">Cuối Kỳ (CK)</th>
                      <th className="px-5 py-3.5 font-bold text-center">Điểm TB Môn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredAverages.map((avg) => {
                      const subjectEntries = filteredEntries.filter(
                        (e) => e.academicTermId === avg.academicTermId && e.assignmentId === avg.assignmentId
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
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="px-5 py-3.5 font-bold text-sm text-slate-900 dark:text-slate-100">
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
                    <tfoot className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-bold">
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
          <div className="content-panel flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Thời khóa biểu tuần của lớp {child.schoolClass?.className ?? ""}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Nắm lịch học các ngày trong tuần để con chuẩn bị bài và sách vở chu đáo.
              </p>
            </div>
            {child.schoolClass?.roomName && (
              <span className="rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60 px-3 py-1 text-xs font-semibold">
                Phòng học: {child.schoolClass.roomName}
              </span>
            )}
          </div>

          {filteredSchedule.length === 0 ? (
            <div className="content-panel rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-slate-500">
              Lớp của con chưa có thời khóa biểu được áp dụng trong học kỳ này.
            </div>
          ) : (
            <div className="content-panel overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-xs table-fixed">
                  <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="w-16 px-4 py-3.5 text-center font-bold">Tiết</th>
                      {scheduleDays.map((d) => (
                        <th key={d} className="px-3 py-3.5 text-left font-bold">
                          Thứ {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {schedulePeriods.map((p) => (
                      <tr key={p} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                        <td className="px-4 py-3.5 text-center font-bold text-slate-500 bg-slate-50 dark:bg-slate-800/50">
                          Tiết {p}
                        </td>
                        {scheduleDays.map((d) => {
                          const slot = filteredSchedule.find(
                            (s) => s.dayOfWeek === d && s.periodNo === p
                          );
                          return (
                            <td key={d} className="px-3 py-3 align-top border-l border-slate-100 dark:border-slate-800">
                              {slot ? (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                    {slot.subjectName}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {slot.teacherName}
                                  </div>
                                  <div className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">
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

      {activeTab === "exams" && (
        <div className="space-y-4">
          <div className="content-panel rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Lịch thi các kỳ thi chính thức</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Phụ huynh nhắc nhở con ôn tập và đi thi đúng giờ theo số báo danh và phòng thi quy định.
            </p>
          </div>

          {child.examSeats.length === 0 ? (
            <div className="content-panel rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-slate-500">
              Hiện tại học sinh chưa có lịch thi nào được công bố.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {child.examSeats.map((seat) => (
                <div
                  key={seat.id}
                  className="item-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60 px-2.5 py-1 text-xs font-bold">
                      {seat.subjectName}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {seat.eventTitle}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-center border border-slate-200/80 dark:border-slate-700/80">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">Phòng thi</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{seat.roomName}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">Số báo danh</div>
                      <div className="text-sm font-bold text-orange-600 dark:text-orange-400">
                        {seat.registrationNo}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase">Vị trí ghế</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Ghế {seat.seatNo}</div>
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
          <div className="content-panel rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Tình hình mượn trả sách thư viện</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Theo dõi các đầu sách học sinh đang mượn từ thư viện nhà trường.
            </p>
          </div>

          {child.loans.length === 0 ? (
            <div className="content-panel rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-slate-500">
              Học sinh hiện không mượn sách thư viện nào hoặc đã hoàn trả đầy đủ.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {child.loans.map((loan, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl border p-4 shadow-xs space-y-2 ${
                    loan.isOverdue
                      ? "border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{loan.bookTitle}</div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${
                        loan.isOverdue
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {loan.isOverdue ? "ĐÃ QUÁ HẠN" : "ĐANG MƯỢN"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span>Mượn: {loan.borrowedDate}</span>
                    <span className={loan.isOverdue ? "text-rose-600 font-bold" : ""}>
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
