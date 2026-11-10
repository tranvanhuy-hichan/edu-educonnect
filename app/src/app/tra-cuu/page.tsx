import Link from "next/link";
import { db } from "@/lib/db";
import { getSchoolSetting } from "@/lib/school-setting";
import { fmtDate, fmtTime } from "@/lib/format";
import { PrintButton } from "./print-btn";
import {
  Award,
  BookOpen,
  Calendar,
  Phone,
  Search,
  User,
  AlertCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function getStudentData(code?: string, phone?: string) {
  if (!code && !phone) return null;
  const conditions = [];
  if (code) {
    conditions.push({ code: { equals: code, mode: "insensitive" as const } });
  }
  if (phone) {
    conditions.push({ guardianPhone: { contains: phone } });
  }

  return db.student.findFirst({
    where: { AND: conditions },
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
          assignment: { include: { subject: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      loans: {
        where: { status: { in: ["BORROWED", "PARTIALLY_RETURNED"] } },
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
}

type StudentData = NonNullable<Awaited<ReturnType<typeof getStudentData>>>;

export default async function PublicStudentLookup({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; phone?: string }>;
}) {
  const sp = await searchParams;
  const brand = await getSchoolSetting();
  const code = sp.code?.trim();
  const phone = sp.phone?.trim();
  const hasSearched = Boolean(code || phone);

  const student = hasSearched ? await getStudentData(code, phone) : null;
  const latestEnrollment = student?.enrollments[0];
  const schoolClass = latestEnrollment?.schoolClass;
  const homeroomTeacher = schoolClass?.homeroomTeacher;
  const yearEnd = student?.yearEndResults[0];

  // Gom điểm theo học kỳ
  const termsMap = new Map<
    string,
    {
      termName: string;
      yearName: string;
      averages: StudentData["subjectAverages"];
      entries: StudentData["scoreEntries"];
    }
  >();

  if (student) {
    for (const avg of student.subjectAverages) {
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
    for (const entry of student.scoreEntries) {
      const tid = entry.academicTermId;
      if (termsMap.has(tid)) {
        termsMap.get(tid)!.entries.push(entry);
      }
    }
  }

  const RESULT_LABELS: Record<string, string> = {
    LEN_LOP: "Lên lớp",
    O_LAI: "Ở lại lớp",
    THI_LAI: "Thi lại trong hè",
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navigation */}
      <header className="no-print border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="" className="size-10 rounded-full object-cover" />
            ) : (
              <div className="grid size-10 place-items-center rounded-full bg-orange-600 font-bold text-white">
                {brand.schoolName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-bold text-slate-800 leading-tight">{brand.schoolName}</div>
              <div className="text-xs text-orange-600 font-semibold tracking-wide">CỔNG THÔNG TIN SỔ LIÊN LẠC ĐIỆN TỬ</div>
            </div>
          </div>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            Đăng nhập giáo viên / học sinh
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Tra cứu Form Card */}
        <section className="no-print rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="max-w-2xl">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Tra cứu Sổ liên lạc học sinh</h1>
            <p className="mt-1 text-sm text-slate-600">
              Quý phụ huynh vui lòng nhập Mã học sinh và/hoặc Số điện thoại người giám hộ đã đăng ký với nhà trường để tra cứu kết quả học tập, rèn luyện và chuyên cần.
            </p>
          </div>

          <form method="GET" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Mã học sinh</label>
              <div className="relative mt-1">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="code"
                  defaultValue={code ?? ""}
                  placeholder="Vd: HS2026001..."
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Số điện thoại phụ huynh</label>
              <div className="relative mt-1">
                <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="phone"
                  defaultValue={phone ?? ""}
                  placeholder="Vd: 0912345678..."
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700"
              >
                <Search className="size-4" /> Tra cứu ngay
              </button>
            </div>
          </form>
        </section>

        {/* Chưa tìm kiếm */}
        {!hasSearched && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-orange-50 text-orange-600">
              <BookOpen className="size-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-800">Cổng thông tin phụ huynh trực tuyến</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Hệ thống cung cấp đầy đủ thông tin điểm số từng môn, hạnh kiểm, lịch thi và sách thư viện của học sinh mọi lúc mọi nơi.
            </p>
          </div>
        )}

        {/* Tìm kiếm không thấy kết quả */}
        {hasSearched && !student && (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
            <AlertCircle className="mx-auto size-8 text-red-500" />
            <h3 className="mt-2 text-base font-semibold">Không tìm thấy thông tin học sinh</h3>
            <p className="mt-1 text-sm text-red-600">
              Vui lòng kiểm tra lại Mã học sinh hoặc Số điện thoại người giám hộ. Nếu thông tin bị sai sót, phụ huynh vui lòng liên hệ Giáo viên chủ nhiệm để cập nhật.
            </p>
          </div>
        )}

        {/* Kết quả tra cứu */}
        {student && (
          <div className="mt-8 space-y-6">
            {/* Thẻ Hồ sơ Học sinh */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="flex items-center gap-4">
                  <div className="grid size-14 place-items-center rounded-2xl bg-orange-100 text-2xl font-bold text-orange-700">
                    {student.fullName.slice(-1)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{student.fullName}</h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>Mã HS: <b className="font-semibold text-slate-700">{student.code ?? "Chưa cấp"}</b></span>
                      <span>·</span>
                      <span>Lớp: <b className="font-semibold text-slate-700">{schoolClass?.className ?? "-"}</b></span>
                      <span>·</span>
                      <span>Năm học: <b className="font-semibold text-slate-700">{latestEnrollment?.academicYear.yearName ?? "-"}</b></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <PrintButton />
                  {yearEnd && (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                      {RESULT_LABELS[yearEnd.result] ?? yearEnd.result}
                    </span>
                  )}
                </div>
              </div>

              {/* Thông tin chi tiết */}
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <div className="text-xs text-slate-500">Ngày sinh</div>
                  <div className="mt-1 font-semibold text-slate-800">{student.dob ? fmtDate(student.dob) : "Chưa cập nhật"}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <div className="text-xs text-slate-500">Phụ huynh / Người giám hộ</div>
                  <div className="mt-1 font-semibold text-slate-800">{student.guardianName || "Chưa cập nhật"}</div>
                  <div className="text-xs text-slate-500">{student.guardianPhone}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <div className="text-xs text-slate-500">Giáo viên chủ nhiệm</div>
                  <div className="mt-1 font-semibold text-slate-800">{homeroomTeacher?.fullName ?? "-"}</div>
                  <div className="text-xs text-slate-500">{homeroomTeacher?.phone ?? ""}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5">
                  <div className="text-xs text-slate-500">Tổng kết cả năm</div>
                  <div className="mt-1 font-semibold text-orange-700">
                    {yearEnd ? `ĐTB: ${yearEnd.overallAverage} · HK: ${yearEnd.conductRank ?? "Tốt"}` : "Đang cập nhật"}
                  </div>
                </div>
              </div>
            </div>

            {/* Bảng điểm các học kỳ */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-lg">
                <Award className="size-5 text-orange-600" />
                Bảng điểm chi tiết
              </div>

              {termsMap.size === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Chưa có dữ liệu điểm số được công bố cho học sinh này.</p>
              ) : (
                <div className="mt-4 space-y-6">
                  {Array.from(termsMap.entries()).map(([tid, term]) => {
                    // Tính điểm TB học kỳ
                    const sum = term.averages.reduce((acc, a) => acc + (a.averageValue ?? 0), 0);
                    const count = term.averages.length;
                    const termAvg = count > 0 ? (sum / count).toFixed(2) : "-";

                    return (
                      <div key={tid} className="overflow-hidden rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between bg-orange-50/70 px-4 py-3 border-b border-slate-200">
                          <span className="font-semibold text-orange-950">
                            {term.termName} · Năm học {term.yearName}
                          </span>
                          <span className="text-sm font-bold text-orange-800">
                            Điểm trung bình học kỳ: {termAvg}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                              <tr>
                                <th className="px-4 py-2.5">Môn học</th>
                                <th className="px-4 py-2.5">Giáo viên</th>
                                <th className="px-4 py-2.5 text-center">Điểm TX</th>
                                <th className="px-4 py-2.5 text-center">Giữa kỳ</th>
                                <th className="px-4 py-2.5 text-center">Cuối kỳ</th>
                                <th className="px-4 py-2.5 text-center font-bold text-orange-700">ĐTB Môn</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {term.averages.map((avg) => {
                                const subEntries = term.entries.filter((e) => e.assignmentId === avg.assignmentId);
                                const txList = subEntries.filter((e) => e.scoreType === "THUONG_XUYEN").map((e) => e.value);
                                const gk = subEntries.find((e) => e.scoreType === "GIUA_KY")?.value;
                                const ck = subEntries.find((e) => e.scoreType === "CUOI_KY")?.value;

                                return (
                                  <tr key={avg.id} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-2.5 font-medium text-slate-900">{avg.assignment.subject.subjectName}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-500">{avg.assignment.teacher.fullName}</td>
                                    <td className="px-4 py-2.5 text-center text-xs text-slate-600">
                                      {txList.length ? txList.join(", ") : "-"}
                                    </td>
                                    <td className="px-4 py-2.5 text-center font-medium">{gk != null ? gk : "-"}</td>
                                    <td className="px-4 py-2.5 text-center font-medium">{ck != null ? ck : "-"}</td>
                                    <td className="px-4 py-2.5 text-center font-bold text-orange-700">{avg.averageValue.toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sách thư viện đang mượn */}
            {student.loans.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-lg">
                  <BookOpen className="size-5 text-orange-600" />
                  Sách thư viện đang mượn ({student.loans.reduce((acc, l) => acc + l.items.length, 0)} cuốn)
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  {student.loans.map((loan) => {
                    const isOverdue = loan.dueDate < new Date();
                    return (
                      <div key={loan.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-800 text-sm">
                            {loan.items.map((i) => i.bookCopy.bookTitle.title).join(", ")}
                          </div>
                          <div className="text-xs text-slate-500">Mã phiếu: {loan.loanCode} · Hạn trả: {fmtDate(loan.dueDate)}</div>
                        </div>
                        {isOverdue ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                            Quá hạn trả sách
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                            Đang mượn
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Lịch thi sắp tới */}
            {student.examSeats.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-lg">
                  <Calendar className="size-5 text-orange-600" />
                  Lịch thi & Số báo danh
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {student.examSeats.map((seat) => {
                    const room = seat.examRoom;
                    const paper = seat.paper;
                    return (
                      <div key={seat.id} className="rounded-xl border border-slate-200 p-3.5 bg-slate-50">
                        <div className="font-semibold text-slate-900 text-sm">{paper.subject.subjectName} · {paper.event.title}</div>
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                          <span>SBD: <b className="text-orange-700">{seat.registrationNo}</b> (Số ghế: {seat.seatNo})</span>
                          <span>Phòng: <b>{room.room?.roomName ?? room.label}</b></span>
                          <span>Bắt đầu: <b>{fmtTime(paper.startsAt)}</b></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
