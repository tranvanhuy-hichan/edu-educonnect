import Link from "next/link";
import { db } from "@/lib/db";
import { requireParentSession } from "@/lib/auth/parent-session";
import { getSchoolSetting } from "@/lib/school-setting";
import { fmtDate, fmtTime } from "@/lib/format";
import { ParentHeader, type ChildSummary } from "./parent-header";
import { PrintButton } from "../tra-cuu/print-btn";
import {
  Award,
  BookOpen,
  Calendar,
  Phone,
  User,
  AlertCircle,
  GraduationCap,
  Clock,
  ClipboardList,
  CheckCircle2,
  FileText,
} from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const brand = await getSchoolSetting();
  const icon = brand.logoUrl || "/favicon.svg";
  return {
    title: `Sổ liên lạc điện tử · ${brand.schoolName}`,
    icons: {
      icon: [{ url: icon }],
      shortcut: [icon],
      apple: [{ url: icon }],
    },
  };
}

const RESULT_LABELS: Record<string, string> = {
  LEN_LOP: "Lên lớp",
  O_LAI: "Ở lại lớp",
  THI_LAI: "Thi lại trong hè",
};

export default async function ParentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const parent = await requireParentSession();
  const brand = await getSchoolSetting();
  const sp = await searchParams;

  // Lấy toàn bộ học sinh liên kết với SĐT của phụ huynh
  const rawStudents = await db.student.findMany({
    where: {
      OR: [
        { guardianPhone: parent.phone },
        { guardianPhone: { startsWith: parent.phone } },
      ],
    },
    include: {
      enrollments: {
        include: {
          academicYear: true,
          schoolClass: {
            include: {
              homeroomTeacher: true,
              gradeLevel: true,
            },
          },
        },
        orderBy: { academicYear: { startDate: "desc" } },
      },
      yearEndResults: {
        include: { academicYear: true },
        orderBy: { academicYear: { startDate: "desc" } },
      },
      subjectAverages: {
        include: {
          academicTerm: { include: { academicYear: true } },
          assignment: { include: { subject: true, teacher: true } },
        },
      },
      scoreEntries: {
        include: {
          academicTerm: true,
          assignment: { include: { subject: true, teacher: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      loans: {
        where: { status: { in: ["BORROWED", "PARTIALLY_RETURNED", "OVERDUE"] } },
        include: {
          items: {
            include: { bookCopy: { include: { bookTitle: true } } },
          },
        },
        orderBy: { dueDate: "asc" },
      },
      examSeats: {
        include: {
          paper: {
            include: {
              event: true,
              subject: true,
            },
          },
          examRoom: {
            include: {
              room: true,
            },
          },
        },
      },
    },
  });

  if (!rawStudents.length) {
    return (
      <div className="min-h-screen theme-bg text-[var(--fg)]">
        <ParentHeader
          brandName={brand.schoolName}
          brandLogo={brand.logoUrl}
          parentPhone={parent.phone}
          parentName={parent.fullName}
          childrenList={[]}
          selectedChildId=""
        />
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <div className="mx-auto size-16 grid place-items-center rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mb-4">
            <AlertCircle className="size-8" />
          </div>
          <h2 className="text-xl font-bold">Chưa tìm thấy hồ sơ học sinh liên kết</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Số điện thoại <strong>{parent.phone}</strong> hiện chưa khớp với hồ sơ học sinh nào trong cơ sở dữ liệu của nhà trường.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Vui lòng liên hệ với Giáo viên chủ nhiệm để kiểm tra và cập nhật Số điện thoại người giám hộ chính xác.
          </p>
        </main>
      </div>
    );
  }

  // Danh sách tóm tắt các con
  const childrenList: ChildSummary[] = rawStudents.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    code: s.code,
    className: s.enrollments[0]?.schoolClass?.className ?? "Chưa xếp lớp",
  }));

  // Xác định con đang chọn
  const selectedStudent =
    rawStudents.find((s) => s.id === sp.child) ?? rawStudents[0];

  const latestEnrollment = selectedStudent.enrollments[0];
  const schoolClass = latestEnrollment?.schoolClass;
  const homeroomTeacher = schoolClass?.homeroomTeacher;
  const yearEnd = selectedStudent.yearEndResults[0];

  // Lấy sổ đầu bài gần đây của lớp
  const recentLogs = schoolClass?.id
    ? await db.classPeriodLog.findMany({
        where: { schoolClassId: schoolClass.id },
        include: {
          timetableSlot: {
            include: {
              assignment: {
                include: { subject: true, teacher: true },
              },
            },
          },
        },
        orderBy: { logDate: "desc" },
        take: 10,
      })
    : [];

  // Gom điểm theo từng học kỳ
  const termsMap = new Map<
    string,
    {
      termName: string;
      yearName: string;
      averages: (typeof selectedStudent.subjectAverages)[number][];
      entries: (typeof selectedStudent.scoreEntries)[number][];
    }
  >();

  for (const avg of selectedStudent.subjectAverages) {
    const tid = avg.academicTermId;
    if (!termsMap.has(tid)) {
      termsMap.set(tid, {
        termName: avg.academicTerm.termName,
        yearName: avg.academicTerm.academicYear.yearName,
        averages: [],
        entries: [],
      });
    }
    termsMap.get(tid)!.averages.push(avg);
  }

  for (const entry of selectedStudent.scoreEntries) {
    const tid = entry.academicTermId;
    if (termsMap.has(tid)) {
      termsMap.get(tid)!.entries.push(entry);
    }
  }

  return (
    <div className="min-h-screen theme-bg text-[var(--fg)]">
      <ParentHeader
        brandName={brand.schoolName}
        brandLogo={brand.logoUrl}
        parentPhone={parent.phone}
        parentName={parent.fullName}
        childrenList={childrenList}
        selectedChildId={selectedStudent.id}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-6">
        {/* Banner hồ sơ học sinh */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-orange-100 dark:bg-orange-950/60 font-bold text-orange-600 dark:text-orange-400 text-2xl">
                {selectedStudent.fullName.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--fg)]">
                    {selectedStudent.fullName}
                  </h1>
                  {selectedStudent.code && (
                    <span className="rounded-full bg-orange-100 dark:bg-orange-950/60 px-2.5 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-400">
                      Mã HS: {selectedStudent.code}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  {schoolClass ? (
                    <>
                      Lớp <strong>{schoolClass.className}</strong> ({schoolClass.gradeLevel.gradeName}) · Năm học {latestEnrollment?.academicYear.yearName}
                    </>
                  ) : (
                    "Chưa phân lớp"
                  )}
                  {selectedStudent.dob && ` · Ngày sinh: ${fmtDate(selectedStudent.dob)}`}
                </p>
              </div>
            </div>

            <div className="no-print flex items-center gap-2">
              <PrintButton />
            </div>
          </div>

          {/* Hàng thông tin GVCN & Người giám hộ */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 border-t border-[var(--line)] pt-4 text-xs">
            <div className="flex items-center gap-2 rounded-lg bg-[var(--bg)] p-3 border border-[var(--line)]">
              <GraduationCap className="size-4 text-orange-600 dark:text-orange-400 shrink-0" />
              <div>
                <div className="text-slate-500 dark:text-slate-400">Giáo viên chủ nhiệm:</div>
                <div className="font-semibold text-[var(--fg)]">
                  {homeroomTeacher?.fullName ?? "Chưa phân công"}
                  {homeroomTeacher?.phone && (
                    <a
                      href={`tel:${homeroomTeacher.phone}`}
                      className="ml-2 inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline"
                    >
                      <Phone className="size-3" />
                      {homeroomTeacher.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-[var(--bg)] p-3 border border-[var(--line)]">
              <User className="size-4 text-orange-600 dark:text-orange-400 shrink-0" />
              <div>
                <div className="text-slate-500 dark:text-slate-400">Người giám hộ đã đăng ký:</div>
                <div className="font-semibold text-[var(--fg)]">
                  {selectedStudent.guardianName || parent.fullName || "Phụ huynh"} · {selectedStudent.guardianPhone}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-[var(--bg)] p-3 border border-[var(--line)]">
              <Award className="size-4 text-orange-600 dark:text-orange-400 shrink-0" />
              <div>
                <div className="text-slate-500 dark:text-slate-400">Kết quả năm học:</div>
                <div className="font-semibold text-[var(--fg)]">
                  {yearEnd ? (
                    <>
                      TB: <strong className="text-orange-600 dark:text-orange-400">{yearEnd.overallAverage.toFixed(1)}</strong>
                      {yearEnd.conductRank && ` · HK: ${yearEnd.conductRank}`}
                      {yearEnd.result && ` · ${RESULT_LABELS[yearEnd.result] ?? yearEnd.result}`}
                    </>
                  ) : (
                    "Đang cập nhật"
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bảng điểm chi tiết theo học kỳ */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2 text-[var(--fg)]">
              <ClipboardList className="size-5 text-orange-600 dark:text-orange-400" />
              Kết quả học tập & Bảng điểm chi tiết
            </h2>
          </div>

          {termsMap.size === 0 ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center text-slate-500">
              Chưa có dữ liệu điểm được ghi nhận cho học sinh trong các học kỳ.
            </div>
          ) : (
            Array.from(termsMap.entries()).map(([tid, term]) => (
              <div
                key={tid}
                className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm"
              >
                <div className="border-b border-[var(--line)] bg-[var(--bg)] px-5 py-3 font-semibold text-sm flex items-center justify-between">
                  <span>
                    {term.termName} — Năm học {term.yearName}
                  </span>
                  <span className="text-xs font-normal text-slate-500">
                    {term.averages.length} môn có điểm
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--line)] bg-slate-50/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Môn học</th>
                        <th className="px-4 py-3 font-semibold">Giáo viên</th>
                        <th className="px-4 py-3 font-semibold">Điểm TX</th>
                        <th className="px-4 py-3 font-semibold text-center">Điểm GK</th>
                        <th className="px-4 py-3 font-semibold text-center">Điểm CK</th>
                        <th className="px-4 py-3 font-semibold text-center">TB Môn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {term.averages.map((avg) => {
                        const subName = avg.assignment.subject.subjectName;
                        const teacherName = avg.assignment.teacher.fullName;
                        const subjectEntries = term.entries.filter(
                          (e) => e.assignmentId === avg.assignmentId
                        );
                        const tx = subjectEntries
                          .filter((e) => e.scoreType === "THUONG_XUYEN")
                          .map((e) => e.value.toFixed(1))
                          .join(", ");
                        const gk = subjectEntries.find((e) => e.scoreType === "GIUA_KY")?.value?.toFixed(1) ?? "—";
                        const ck = subjectEntries.find((e) => e.scoreType === "CUOI_KY")?.value?.toFixed(1) ?? "—";

                        return (
                          <tr key={avg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3 font-semibold text-[var(--fg)]">
                              {subName}
                            </td>
                            <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                              {teacherName}
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                              {tx || "—"}
                            </td>
                            <td className="px-4 py-3 text-center font-medium">{gk}</td>
                            <td className="px-4 py-3 text-center font-medium">{ck}</td>
                            <td className="px-4 py-3 text-center font-bold text-orange-600 dark:text-orange-400">
                              {avg.averageValue.toFixed(1)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </section>

        {/* Lịch thi & Sách thư viện */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Lịch thi sắp tới */}
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <h3 className="text-base font-bold flex items-center gap-2 mb-4 text-[var(--fg)]">
              <Calendar className="size-4 text-orange-600 dark:text-orange-400" />
              Lịch thi & Phòng thi của con
            </h3>

            {selectedStudent.examSeats.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Hiện tại học sinh chưa có lịch thi nào được công bố.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedStudent.examSeats.map((seat) => (
                  <div
                    key={seat.id}
                    className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-sm text-[var(--fg)]">
                        {seat.paper.subject.subjectName} · {seat.paper.event.title}
                      </div>
                      <div className="mt-1 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span>Phòng: <strong>{seat.examRoom.room?.roomName ?? seat.examRoom.label}</strong></span>
                        <span>· SBD: <strong>{seat.registrationNo}</strong></span>
                        <span>· Ghế: <strong>{seat.seatNo}</strong></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Sách thư viện mượn */}
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <h3 className="text-base font-bold flex items-center gap-2 mb-4 text-[var(--fg)]">
              <BookOpen className="size-4 text-orange-600 dark:text-orange-400" />
              Sách thư viện đang mượn
            </h3>

            {selectedStudent.loans.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Học sinh hiện không mượn sách thư viện nào hoặc đã hoàn trả đầy đủ.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedStudent.loans.map((loan) => {
                  const isOverdue =
                    loan.status === "OVERDUE" || new Date(loan.dueDate) < new Date();
                  return (
                    <div
                      key={loan.id}
                      className={`rounded-xl border p-3 text-xs ${
                        isOverdue
                          ? "border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                          : "border-[var(--line)] bg-[var(--bg)]"
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>
                          {loan.items.map((it) => it.bookCopy.bookTitle.title).join(", ")}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isOverdue
                              ? "bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-200"
                              : "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {isOverdue ? "ĐÃ QUÁ HẠN" : "ĐANG MƯỢN"}
                        </span>
                      </div>
                      <div className="mt-1 text-slate-500 dark:text-slate-400 flex items-center gap-3">
                        <span>Ngày mượn: {fmtDate(loan.borrowedDate)}</span>
                        <span>Hạn trả: <strong>{fmtDate(loan.dueDate)}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Sổ đầu bài & Tình hình nề nếp lớp học */}
        {recentLogs.length > 0 && (
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <h3 className="text-base font-bold flex items-center gap-2 mb-4 text-[var(--fg)]">
              <FileText className="size-4 text-orange-600 dark:text-orange-400" />
              Sổ đầu bài & Theo dõi nề nếp tiết học gần đây của lớp {schoolClass?.className}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--line)] bg-slate-50/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Ngày</th>
                    <th className="px-4 py-2.5 font-semibold">Môn học</th>
                    <th className="px-4 py-2.5 font-semibold">Giáo viên</th>
                    <th className="px-4 py-2.5 font-semibold text-center">Xếp loại tiết</th>
                    <th className="px-4 py-2.5 font-semibold text-center">Vắng</th>
                    <th className="px-4 py-2.5 font-semibold">Nhận xét giáo viên</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {recentLogs.map((log) => {
                    const sub = log.timetableSlot.assignment.subject.subjectName;
                    const teacher = log.timetableSlot.assignment.teacher.fullName;
                    return (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                          {fmtDate(log.logDate)}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-[var(--fg)]">{sub}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{teacher}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
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
                        <td className="px-4 py-2.5 text-center font-medium">
                          {log.attendanceAbsentCount > 0 ? (
                            <span className="text-red-600 dark:text-red-400 font-bold">
                              {log.attendanceAbsentCount} em
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 italic">
                          {log.note || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
