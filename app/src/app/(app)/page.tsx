import { loadScheduleSlots } from "@/modules/scheduling/schedule-slots";
import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { Activity, AlertTriangle, BookOpen, CalendarClock, ChevronDown, ClipboardList, DoorOpen, GraduationCap, Library, Presentation, School, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES } from "@/lib/guard";
import { Card, Title } from "@/components/ui";
import { fmtDate, todayUTC } from "@/lib/format";

type TodaySlot = { kind: "lesson" | "activity"; id: string; periodNo: number; schoolClass: { className: string }; assignment: { subject: { subjectName: string }; teacher: { fullName: string } }; room: { roomName: string } };

const fmtTime = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });

const ACTION_LABEL: Record<string, string> = {
  create_exam: "Tạo lịch thi", update_exam: "Sửa lịch thi", publish_exam: "Công bố lịch thi", withdraw_exam: "Thu hồi lịch thi", cancel_exam: "Hủy lịch thi",
  create_user: "Tạo tài khoản", update_user_roles: "Sửa vai trò", activate_user: "Mở khoá tài khoản", deactivate_user: "Khoá tài khoản",
  reset_password: "Đặt lại mật khẩu", change_password: "Đổi mật khẩu", settings: "Đổi cấu hình", create: "Thêm mới", update: "Cập nhật", delete: "Xoá",
};

function TodayList({ slots, empty = "Hôm nay không có tiết nào.", write = false }: { slots: TodaySlot[]; empty?: string; write?: boolean }) {
  if (!slots.length) return <p className="px-4 py-10 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y">
      {slots.map((s) => (
        <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-x-4">
          <div className="text-sm font-semibold tabular-nums sm:w-20 sm:shrink-0">Tiết {s.periodNo}</div>
          <div className="min-w-0 sm:flex-1">
            <div className="font-medium sm:truncate">{s.schoolClass.className} · {s.assignment.subject.subjectName}</div>
            <div className="text-xs text-slate-500 sm:truncate">{s.assignment.teacher.fullName} · Phòng {s.room.roomName}</div>
          </div>
          {write && s.kind !== "activity" && <Link href="/so-dau-bai" className="inline-flex h-9 w-full items-center justify-center rounded-md border bg-white px-3 text-sm font-medium text-orange-700 hover:bg-orange-50 sm:h-8 sm:w-auto">Ghi sổ đầu bài</Link>}
        </li>
      ))}
    </ul>
  );
}

export default async function Home() {
  const me = await requireRole();
  const today = todayUTC();
  const dow = today.getUTCDay() === 0 ? null : today.getUTCDay() + 1; // Thứ 2 = 2 … Thứ 7 = 7; Chủ nhật nghỉ
  const term = (await db.academicTerm.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } } })) ?? (await db.academicTerm.findFirst({ orderBy: { startDate: "desc" } }));
  const yearWhere = term ? { academicYearId: term.academicYearId } : {};
  const todaySlots = (where: object): Promise<TodaySlot[]> =>
    term && dow ? loadScheduleSlots({ academicTermId: term.id, dayOfWeek: dow, ...where, ...effectiveSlots(today) }) : Promise.resolve([]);

  const isManager = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const isAdmin = me.roles.includes("ADMIN");
  const isTeacher = !!me.teacherId && me.roles.some((r) => r === "HOMEROOM_TEACHER" || r === "SUBJECT_TEACHER");
  const isHomeroom = me.roles.includes("HOMEROOM_TEACHER");
  const isStudent = !!me.studentId && me.roles.includes("STUDENT");
  const isLibrarian = me.roles.includes("LIBRARIAN");
  const overdueWhere = { OR: [{ status: "OVERDUE" as const }, { status: "BORROWED" as const, dueDate: { lt: today } }] };

  const Stat = ({ icon: I, label, value, href, tone = "bg-orange-100 text-orange-700", valueTone = "" }: { icon: typeof Users; label: string; value: React.ReactNode; href: string; tone?: string; valueTone?: string }) => (
    <Link href={href}>
      <Card className="flex h-full items-center gap-2 p-3 transition-colors hover:border-orange-400 sm:gap-3 sm:p-4">
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-11 ${tone}`}><I className="size-4 sm:size-5" /></span>
        <div className="min-w-0"><div className="truncate text-xs text-slate-500">{label}</div><div className={`truncate text-xl font-bold leading-tight sm:text-2xl ${valueTone}`}>{value}</div></div>
      </Card>
    </Link>
  );
  const todayCard = (title: string, slots: TodaySlot[], write: boolean, empty?: string) => (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="size-4 text-orange-700" /> {title} ({slots.length})</h2>
        <Link href="/lich-hoc" className="text-sm text-orange-700 hover:underline">Xem thời khóa biểu →</Link>
      </div>
      <TodayList slots={slots} write={write} empty={dow ? empty : "Hôm nay là Chủ nhật, nhà trường nghỉ."} />
    </Card>
  );

  const blocks: React.ReactNode[] = [];

  /* ===== Quản lý (Quản trị / Hiệu trưởng / Hiệu phó) ===== */
  if (isManager) {
    const [students, classes, teachers, rooms, slots, loanCount, loans, noHomeroomCount, noHomeroom, logs] = await Promise.all([
      db.student.count(),
      db.schoolClass.count({ where: yearWhere }),
      db.teacher.count(),
      db.room.count(),
      todaySlots({}),
      db.libraryLoan.count({ where: overdueWhere }),
      db.libraryLoan.findMany({
        where: overdueWhere,
        orderBy: { dueDate: "asc" },
        take: 5,
        include: {
          student: { select: { fullName: true, code: true } },
          bookCopy: { select: { bookTitle: { select: { title: true } } } },
          items: { include: { bookCopy: { select: { bookTitle: { select: { title: true } } } } } },
        },
      }),
      db.schoolClass.count({ where: { ...yearWhere, homeroomTeacherId: null } }),
      db.schoolClass.findMany({ where: { ...yearWhere, homeroomTeacherId: null }, orderBy: { className: "asc" }, take: 6, select: { id: true, className: true, gradeLevel: { select: { gradeName: true } } } }),
      isAdmin ? db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }) : Promise.resolve([]),
    ]);
    const logged = slots.length ? new Set((await db.classPeriodLog.findMany({ where: { timetableSlotId: { in: slots.map((s) => s.id) }, logDate: today }, select: { timetableSlotId: true } })).map((l) => l.timetableSlotId)) : new Set<string>();
    const unlogged = slots.filter((s) => s.kind !== "activity" && !logged.has(s.id));
    blocks.push(
      <div key="manager" className="space-y-4">
        {unlogged.length > 0 && (
          <Card className="border-red-300 p-0">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <h2 className="flex items-center gap-2 font-semibold text-red-600"><AlertTriangle className="size-4 shrink-0" /> Tiết hôm nay chưa ghi sổ đầu bài ({unlogged.length})</h2>
                <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500"><span className="group-open:hidden">Xem</span><span className="hidden group-open:inline">Thu gọn</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" /></span>
              </summary>
              <div className="border-t">
                <p className="px-4 pt-3 text-xs text-slate-500">Các tiết trong thời khóa biểu hôm nay chưa có bản ghi sổ đầu bài. Giáo viên bộ môn ghi sổ ở mục <b>Sổ đầu bài</b>.</p>
                <ul className="divide-y text-sm">
                  {unlogged.slice(0, 6).map((s) => (
                    <li key={s.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><b>{s.schoolClass.className} · {s.assignment.subject.subjectName}</b><div className="text-xs text-slate-500">Tiết {s.periodNo} · {s.assignment.teacher.fullName}</div></div>
                      <Link href="/so-dau-bai" className="inline-flex h-9 w-full items-center justify-center rounded-md bg-orange-600 px-3 text-xs font-medium text-white hover:bg-orange-700 sm:h-8 sm:w-auto">Mở sổ đầu bài</Link>
                    </li>
                  ))}
                </ul>
                {unlogged.length > 6 && <div className="border-t px-4 py-2 text-xs text-slate-500">Còn {unlogged.length - 6} tiết nữa. Xem đầy đủ trong <Link href="/so-dau-bai" className="text-orange-700 underline">Sổ đầu bài</Link>.</div>}
              </div>
            </details>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
          <Stat icon={GraduationCap} label="Học sinh" value={students} href="/hoc-sinh" />
          <Stat icon={School} label="Lớp học" value={classes} href="/lop-hoc" tone="bg-green-100 text-green-700" />
          <Stat icon={Users} label="Giáo viên" value={teachers} href="/giao-vien" tone="bg-sky-100 text-sky-700" />
          <Stat icon={DoorOpen} label="Phòng học" value={rooms} href="/phong-hoc" tone="bg-yellow-100 text-yellow-700" />
          <Stat icon={CalendarClock} label="Tiết hôm nay" value={slots.length} href="/lich-hoc" tone="bg-sky-100 text-sky-700" />
          <Stat icon={Library} label="Sách quá hạn" value={loanCount} href="/thu-vien" tone="bg-red-100 text-red-600" valueTone={loanCount ? "text-red-600" : ""} />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            {todayCard("Thời khóa biểu hôm nay", slots, true)}
            <Card className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-red-600" /> Sách quá hạn ({loanCount})</h2>
                <Link href="/thu-vien" className="text-sm text-orange-700 hover:underline">Xem tất cả →</Link>
              </div>
              <ul className="divide-y text-sm">
                {loans.map((l) => {
                  const title = l.items?.length
                    ? l.items.map((it) => it.bookCopy.bookTitle.title).join(", ")
                    : l.bookCopy?.bookTitle.title ?? "Sách";
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0"><b>{title}</b><div className="text-xs text-slate-500">{l.student.fullName}{l.student.code ? ` · ${l.student.code}` : ""} · hạn trả {fmtDate(l.dueDate)}</div></div>
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">Quá hạn</span>
                    </li>
                  );
                })}
                {!loans.length && <li className="px-4 py-6 text-center text-slate-500">Không có sách quá hạn.</li>}
              </ul>
            </Card>
          </div>
          <div className="space-y-4">
            <Card className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold">Lớp chưa có GVCN ({noHomeroomCount})</h2>
                <Link href="/lop-hoc" className="text-sm text-orange-700 hover:underline">Xem →</Link>
              </div>
              <ul className="divide-y text-sm">
                {noHomeroom.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <Link href={`/lop-hoc/${c.id}`} className="min-w-0 truncate font-medium hover:text-orange-700">{c.className}</Link>
                    <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">{c.gradeLevel.gradeName}</span>
                  </li>
                ))}
                {!noHomeroom.length && <li className="px-4 py-6 text-center text-slate-500">Mọi lớp đều đã có GVCN.</li>}
              </ul>
            </Card>
            {isAdmin && (
              <Card className="p-0">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h2 className="flex items-center gap-2 font-semibold"><Activity className="size-4 text-orange-700" /> Hoạt động gần đây</h2>
                  <Link href="/nhat-ky" className="text-sm text-orange-700 hover:underline">Nhật ký →</Link>
                </div>
                <ul className="divide-y text-sm">
                  {logs.map((l) => (
                    <li key={l.id} className="px-4 py-2.5"><div className="font-medium">{ACTION_LABEL[l.action] ?? l.action}</div><div className="text-xs text-slate-500">{l.actorEmail} · {fmtTime(l.createdAt)}</div></li>
                  ))}
                  {!logs.length && <li className="px-4 py-6 text-center text-slate-500">Chưa có hoạt động nào.</li>}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>,
    );
  }

  /* ===== Giáo viên (GVCN / GVBM) ===== */
  if (isTeacher) {
    const [slots, assignments, homerooms] = await Promise.all([
      todaySlots({ assignment: { teacherId: me.teacherId! } }),
      term ? db.classSubjectAssignment.count({ where: { teacherId: me.teacherId!, academicTermId: term.id } }) : Promise.resolve(0),
      isHomeroom ? db.schoolClass.findMany({ where: { homeroomTeacherId: me.teacherId!, ...yearWhere }, select: { id: true, className: true } }) : Promise.resolve([]),
    ]);
    blocks.push(
      <div key="teacher" className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
          <Stat icon={BookOpen} label="Lớp–môn đang dạy" value={assignments} href="/lop-cua-toi" tone="bg-green-100 text-green-700" />
          {isHomeroom && <Stat icon={Presentation} label="Lớp chủ nhiệm" value={homerooms.length ? homerooms.map((c) => c.className).join(", ") : "—"} href="/lop-chu-nhiem" />}
          <Stat icon={CalendarClock} label="Tiết dạy hôm nay" value={slots.length} href="/lich-hoc" tone="bg-sky-100 text-sky-700" />
        </div>
        {todayCard("Lịch dạy hôm nay", slots, true, "Hôm nay bạn không có tiết dạy nào.")}
      </div>,
    );
  }

  /* ===== Thủ thư (quản lý đã có khối sách quá hạn ở trên) ===== */
  if (isLibrarian && !isManager) {
    const [titles, borrowing, overdue, loans] = await Promise.all([
      db.libraryBookTitle.count(),
      db.libraryLoan.count({ where: { status: "BORROWED" } }),
      db.libraryLoan.count({ where: overdueWhere }),
      db.libraryLoan.findMany({
        where: overdueWhere,
        orderBy: { dueDate: "asc" },
        take: 6,
        include: {
          student: { select: { fullName: true, code: true } },
          bookCopy: { select: { bookTitle: { select: { title: true } } } },
          items: { include: { bookCopy: { select: { bookTitle: { select: { title: true } } } } } },
        },
      }),
    ]);
    blocks.push(
      <div key="librarian" className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
          <Stat icon={Library} label="Đầu sách" value={titles} href="/thu-vien" />
          <Stat icon={ClipboardList} label="Đang cho mượn" value={borrowing} href="/thu-vien" tone="bg-sky-100 text-sky-700" />
          <Stat icon={AlertTriangle} label="Quá hạn" value={overdue} href="/thu-vien" tone="bg-red-100 text-red-600" valueTone={overdue ? "text-red-600" : ""} />
        </div>
        <Card className="p-0">
          <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Sách quá hạn ({overdue})</h2><Link href="/thu-vien" className="text-sm text-orange-700 hover:underline">Xem tất cả →</Link></div>
          <ul className="divide-y text-sm">
            {loans.map((l) => {
              const title = l.items?.length
                ? l.items.map((it) => it.bookCopy.bookTitle.title).join(", ")
                : l.bookCopy?.bookTitle.title ?? "Sách";
              return (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0"><b>{title}</b><div className="text-xs text-slate-500">{l.student.fullName}{l.student.code ? ` · ${l.student.code}` : ""} · hạn trả {fmtDate(l.dueDate)}</div></div>
                </li>
              );
            })}
            {!loans.length && <li className="px-4 py-6 text-center text-slate-500">Không có sách quá hạn.</li>}
          </ul>
        </Card>
      </div>,
    );
  }

  /* ===== Học sinh ===== */
  if (isStudent) {
    const student = await db.student.findUnique({
      where: { id: me.studentId! },
      select: { fullName: true, code: true, enrollments: { take: 1, orderBy: { academicYear: { startDate: "desc" } }, select: { schoolClassId: true, schoolClass: { select: { className: true, gradeLevel: { select: { gradeName: true } }, homeroomTeacher: { select: { fullName: true } } } } } } },
    });
    const enrollment = student?.enrollments[0];
    const [slots, averages, loans] = await Promise.all([
      enrollment ? todaySlots({ schoolClassId: enrollment.schoolClassId }) : Promise.resolve([]),
      db.subjectTermAverage.findMany({ where: { studentId: me.studentId! }, orderBy: [{ academicTerm: { startDate: "desc" } }, { assignment: { subject: { subjectName: "asc" } } }], take: 8, include: { assignment: { select: { subject: { select: { subjectName: true } } } }, academicTerm: { select: { termName: true } } } }),
      db.libraryLoan.findMany({
        where: { studentId: me.studentId!, status: { in: ["BORROWED", "OVERDUE", "PARTIALLY_RETURNED"] } },
        orderBy: { dueDate: "asc" },
        include: {
          bookCopy: { select: { bookTitle: { select: { title: true } } } },
          items: { include: { bookCopy: { select: { bookTitle: { select: { title: true } } } } } },
        },
      }),
    ]);
    const avg = averages.length ? Math.round((averages.reduce((n, a) => n + a.averageValue, 0) / averages.length) * 100) / 100 : null;
    const hue = [...me.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
    blocks.push(
      <div key="student" className="space-y-4">
        <Card className="flex flex-wrap items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full text-2xl font-bold" style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 25%)` }}>{(student?.fullName ?? me.name).split(" ").pop()?.[0]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{student?.fullName ?? me.name}</h1>{student?.code && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{student.code}</span>}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {enrollment ? <span className="flex items-center gap-1"><GraduationCap className="size-4" />Lớp {enrollment.schoolClass.className} · {enrollment.schoolClass.gradeLevel.gradeName}</span> : <span>Chưa được xếp lớp</span>}
              {enrollment?.schoolClass.homeroomTeacher && <span>GVCN: {enrollment.schoolClass.homeroomTeacher.fullName}</span>}
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          <Stat icon={School} label="Lớp" value={enrollment?.schoolClass.className ?? "—"} href="/lich-hoc" tone="bg-green-100 text-green-700" />
          <Stat icon={CalendarClock} label="Tiết hôm nay" value={slots.length} href="/lich-hoc" tone="bg-sky-100 text-sky-700" />
          <Stat icon={ClipboardList} label="Điểm trung bình" value={avg ?? "—"} href="/diem-cua-toi" />
          <Stat icon={Library} label="Sách đang mượn" value={loans.length} href="/thu-vien" tone="bg-yellow-100 text-yellow-700" />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">{todayCard("Thời khóa biểu hôm nay", slots, false, "Hôm nay lớp bạn không có tiết nào.")}</div>
          <div className="space-y-4">
            <Card className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Điểm trung bình môn</h2><Link href="/diem-cua-toi" className="text-sm text-orange-700 hover:underline">Xem →</Link></div>
              <ul className="divide-y text-sm">
                {averages.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5"><span className="min-w-0 truncate font-medium">{a.assignment.subject.subjectName} <span className="text-xs text-slate-500">· {a.academicTerm.termName}</span></span><b className="shrink-0">{a.averageValue}</b></li>)}
                {!averages.length && <li className="px-4 py-6 text-center text-slate-500">Chưa có điểm.</li>}
              </ul>
            </Card>
            <Card className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Sách đang mượn</h2><Link href="/thu-vien" className="text-sm text-orange-700 hover:underline">Xem →</Link></div>
              <ul className="divide-y text-sm">
                {loans.map((l) => {
                  const title = l.items?.length
                    ? l.items.map((it) => it.bookCopy.bookTitle.title).join(", ")
                    : l.bookCopy?.bookTitle.title ?? "Sách";
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="min-w-0 truncate font-medium">{title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${l.status === "OVERDUE" || l.dueDate < today ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"}`}>hạn {fmtDate(l.dueDate)}</span>
                    </li>
                  );
                })}
                {!loans.length && <li className="px-4 py-6 text-center text-slate-500">Bạn chưa mượn quyển sách nào.</li>}
              </ul>
            </Card>
          </div>
        </div>
      </div>,
    );
  }

  return (
    <div className="space-y-4">
      <Title>{isManager ? "Tổng quan" : isStudent && !isTeacher ? "Tổng quan" : `Xin chào, ${me.name}`}</Title>
      {blocks.length ? blocks : <Card className="text-sm text-slate-600">Tài khoản của bạn chưa có chức năng nào để hiển thị. Hãy liên hệ quản trị viên.</Card>}
    </div>
  );
}
