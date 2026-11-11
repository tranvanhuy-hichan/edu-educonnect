import { getPolicy } from "@/lib/policy";
import { ratingText } from "@/lib/policy-schema";
import type { Prisma } from "@prisma/client";
import { SearchableSelect } from "@/components/searchable-select";
import { loadScheduleSlots } from "@/modules/scheduling/schedule-slots";
import { effectiveSlots } from "@/modules/scheduling/effective";
import { weekNumber } from "@/lib/week";
import { scheduleLabel } from "@/lib/nav";
import Link from "next/link";
import {
  CalendarDays,
  Download,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  GraduationCap,
  LayoutList,
  ScrollText,
  Table2,
  User,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { AutoForm } from "@/components/auto-form";
import { ActionMenu } from "@/components/action-menu";
import { DialogTrigger } from "@/components/dialog";
import { MobileCollapse } from "@/components/mobile-collapse";
import { Card, inputCls, Title } from "@/components/ui";
import { WEEKDAYS, addDays, fmtDate, isoDate, mondayOf, parseDate, todayUTC } from "@/lib/format";
import { listTerms } from "@/modules/scheduling/scheduling.repository";

const hue = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};


const PERIOD_TIMES: Record<number, { time: string; session: "morning" | "afternoon" }> = {
  1: { time: "07:15 - 08:00", session: "morning" },
  2: { time: "08:05 - 08:50", session: "morning" },
  3: { time: "09:05 - 09:50", session: "morning" },
  4: { time: "09:55 - 10:40", session: "morning" },
  5: { time: "10:45 - 11:30", session: "morning" },
  6: { time: "13:30 - 14:15", session: "afternoon" },
  7: { time: "14:20 - 15:05", session: "afternoon" },
  8: { time: "15:20 - 16:05", session: "afternoon" },
  9: { time: "16:10 - 16:55", session: "afternoon" },
  10: { time: "17:00 - 17:45", session: "afternoon" },
};

async function loadSlots(where: object) {
  return loadScheduleSlots(where as Prisma.TimetableSlotWhereInput);
}

type Slot = Awaited<ReturnType<typeof loadSlots>>[number];
type S = {
  key: string;
  slot: Slot;
  date: Date;
  done: boolean;
  log: { attendanceAbsentCount: number; conductRating: string | null; note: string | null } | null;
};

export default async function Schedule({
  searchParams,
}: {
  searchParams: Promise<{
    missing?: string;
    created?: string;
    w?: string;
    term?: string;
    grade?: string;
    class?: string;
    teacher?: string;
    room?: string;
    view?: string;
    scope?: string;
    d?: string;
  }>;
}) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES, "STUDENT");
  const sp = await searchParams;
  const view = (["class", "teacher", "room", "list"] as const).find((v) => v === sp.view) ?? "class";
  const fGrade = sp.grade ?? "",
    fClass = sp.class ?? "",
    fTeacher = sp.teacher ?? "",
    fRoom = sp.room ?? "";
  const staff = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const isTeacher = !staff && !!me.teacherId;
  const isLearner = !staff && !isTeacher && !!me.studentId;
  const today = todayUTC();
  const base = sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? parseDate(sp.w) : today;
  const start = mondayOf(base),
    end = addDays(start, 6);
  const step = (n: number) => addDays(start, 7 * n);
  const label = `${fmtDate(start)} - ${fmtDate(end)}`;

  // Học kỳ đang xem: chọn từ bộ lọc, hoặc học kỳ chứa tuần này, hoặc học kỳ gần nhất.
  const terms = await listTerms();
  const term =
    terms.find((t) => t.id === sp.term) ??
    terms.find((t) => t.startDate <= end && t.endDate >= start) ??
    terms[0] ??
    null;

  const versions = term ? await db.timetableVersion.findMany({ where: { academicTermId: term.id }, orderBy: { startsOn: "asc" } }) : [];
  const activeVersion = versions.find((version) => version.startsOn <= start && (!version.endsOn || start < version.endsOn));

  const versionBadge = activeVersion ? <span className="inline-flex shrink-0 items-center rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1.5 align-middle text-xs font-semibold text-orange-800">Từ tuần {weekNumber(term!.academicYear.startDate, activeVersion.startsOn)} · {fmtDate(activeVersion.startsOn)}</span> : null;

  const hasMine = !!me.teacherId;
  const scope = hasMine && sp.scope !== "all" ? "mine" : "all";
  const canFilter = staff || isTeacher;
  const isMine = (s: Slot) =>
    !!me.teacherId &&
    (s.assignment.teacherId === me.teacherId || s.schoolClass.homeroomTeacherId === me.teacherId);
  const canLog = (s: Slot) => s.kind !== "activity" && (staff || (!!me.teacherId && s.assignment.teacherId === me.teacherId));

  const where: Record<string, unknown> = { academicTermId: term?.id ?? "-", ...effectiveSlots(start) };

  // Dành riêng cho học sinh: học sinh chỉ học 1 lớp duy nhất!
  let learnerEnrollment = null;
  if (isLearner) {
    learnerEnrollment = await db.studentClassEnrollment.findFirst({
      where: {
        studentId: me.studentId!,
        ...(term ? { academicYearId: term.academicYearId } : {}),
      },
      include: {
        schoolClass: {
          include: {
            gradeLevel: true,
            homeroomTeacher: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
      orderBy: { academicYear: { startDate: "desc" } },
    });
    where.schoolClassId = learnerEnrollment ? learnerEnrollment.schoolClassId : "-";
  } else {
    if (scope === "mine")
      where.OR = [
        { assignment: { teacherId: me.teacherId } },
        { schoolClass: { homeroomTeacherId: me.teacherId } },
      ];
    if (fClass) where.schoolClassId = fClass;
    if (fTeacher) where.assignment = { teacherId: fTeacher };
    if (fRoom) where.roomId = fRoom;
    if (fGrade) where.schoolClass = { gradeLevelId: fGrade };
  }

  const [slots, classes, teachers, rooms, grades] = await Promise.all([
    term ? loadSlots(where) : Promise.resolve([] as Slot[]),
    db.schoolClass.findMany({
      where: {
        ...(term ? { academicYearId: term.academicYearId } : {}),
        ...(fGrade ? { gradeLevelId: fGrade } : {}),
      },
      orderBy: { className: "asc" },
    }),
    db.teacher.findMany({ orderBy: { fullName: "asc" } }),
    db.room.findMany({ orderBy: { roomName: "asc" } }),
    db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),

  ]);

  const logs = slots.length
    ? await db.classPeriodLog.findMany({
        where: {
          timetableSlotId: { in: slots.map((x) => x.id) },
          logDate: { gte: start, lte: end },
        },
      })
    : [];
  const logOf = new Map(logs.map((l) => [`${l.timetableSlotId}|${isoDate(l.logDate)}`, l]));

  // Trải các tiết lặp thành buổi cụ thể của tuần, chỉ giữ ngày nằm trong học kỳ.
  const sessions: S[] = [];
  for (const slot of slots) {
    const date = addDays(start, slot.dayOfWeek - 2);
    if (term && (date < term.startDate || date > term.endDate)) continue;
    const log = logOf.get(`${slot.id}|${isoDate(date)}`) ?? null;
    sessions.push({ key: `${slot.id}|${isoDate(date)}`, slot, date, done: !!log, log });
  }
  sessions.sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.slot.periodNo - b.slot.periodNo,
  );

  // Tiết trùng (cùng thứ+tiết mà trùng lớp, giáo viên hoặc phòng)
  const clash = new Set<string>();
  const seen = new Map<string, string>();
  for (const x of sessions)
    for (const who of [
      `c:${x.slot.schoolClassId}`,
      `t:${x.slot.assignment.teacherId}`,
      `r:${x.slot.roomId}`,
    ]) {
      const k = `${who}|${x.slot.dayOfWeek}|${x.slot.periodNo}`;
      if (seen.has(k)) {
        clash.add(x.key);
        clash.add(seen.get(k)!);
      } else seen.set(k, x.key);
    }

  const q = (o: Record<string, string>) =>
    `?${new URLSearchParams({
      view,
      w: isoDate(base),
      ...(term ? { term: term.id } : {}),
      ...(fGrade ? { grade: fGrade } : {}),
      ...(fClass ? { class: fClass } : {}),
      ...(fTeacher ? { teacher: fTeacher } : {}),
      ...(fRoom ? { room: fRoom } : {}),
      ...(hasMine ? { scope } : {}),
      ...o,
    })}`;

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const isOverdue = (s: S) => s.slot.kind !== "activity" && !s.done && s.date.getTime() < today.getTime();
  const STATUS_BADGE = {
    PLANNED: ["Chưa ghi sổ", "bg-slate-100 text-slate-600"],
    DONE: ["Đã ghi sổ đầu bài", "bg-green-100 text-green-800"],
  } as const;
  const ratings = (await getPolicy()).diaryRatings;

  // Chi tiết một tiết học dùng trong hộp thoại
  const Detail = ({ s }: { s: S }) => {
    const [stLabel, stTone] = s.slot.kind === "activity" ? ["Hoạt động cố định", "bg-sky-100 text-sky-800"] : STATUS_BADGE[s.done ? "DONE" : "PLANNED"];
    const Row = ({
      icon: I,
      label,
      children,
    }: {
      icon: typeof Users;
      label: string;
      children: React.ReactNode;
    }) => (
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-orange-100 text-orange-700">
          <I className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="font-medium">{children}</div>
        </div>
      </div>
    );
    const x = s.slot;
    return (
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {isOverdue(s) ? (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600">
              Đã qua ngày, chưa ghi sổ đầu bài
            </span>
          ) : (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stTone}`}>
              {stLabel}
            </span>
          )}
          {clash.has(s.key) && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600">
              Trùng lớp / giáo viên / phòng
            </span>
          )}
        </div>
        <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
          <Row icon={CalendarDays} label="Ngày học">
            {WEEKDAYS[s.date.getUTCDay()]}, {fmtDate(s.date)} · Tiết {x.periodNo} ({PERIOD_TIMES[x.periodNo]?.time ?? ""})
          </Row>
          <Row icon={ScrollText} label="Môn học">
            {x.assignment.subject.subjectName}
          </Row>
          <Row icon={User} label="Giáo viên giảng dạy">
            {x.assignment.teacher.fullName}
          </Row>
          <Row icon={DoorOpen} label="Phòng học">
            {x.room.roomName}
          </Row>
          {!isLearner && (
            <Row icon={Users} label="Sĩ số">
              {x.schoolClass._count.enrollments} học sinh
            </Row>
          )}
          {s.log && (
            <Row icon={ScrollText} label="Sổ đầu bài">
              Vắng {s.log.attendanceAbsentCount}
              {s.log.conductRating
                ? ` · Xếp loại ${ratingText(ratings, s.log.conductRating)}`
                : ""}
              {s.log.note ? ` · ${s.log.note}` : ""}
            </Row>
          )}
        </div>
        {isOverdue(s) && canLog(x) && (
          <div className="space-y-2 rounded-lg border border-red-300/70 bg-red-50 p-3">
            <div className="font-medium text-red-600">
              Tiết này đã qua ngày nhưng chưa được ghi sổ đầu bài
            </div>
            <div className="text-xs text-slate-600">
              Bấm “Ghi sổ đầu bài bù” để ghi nhận sĩ số vắng và xếp loại tiết học.
            </div>
          </div>
        )}
        {x.kind !== "activity" && !isLearner && (canLog(x) || isMine(x)) && (
          <Link
            href={`/so-dau-bai?class=${x.schoolClassId}&d=${isoDate(s.date)}`}
            className="inline-flex h-9 items-center rounded-md bg-orange-600 px-4 font-medium text-white hover:bg-orange-700"
          >
            {s.done ? "Mở sổ đầu bài" : isOverdue(s) ? "Ghi sổ đầu bài bù" : "Ghi sổ đầu bài"}
          </Link>
        )}

      </div>
    );
  };

  const tone = (s: S) => {
    const h = hue(s.slot.assignment.subjectId);
    if (clash.has(s.key) || isOverdue(s))
      return {
        background: "#fee2e2",
        borderLeft: "4px solid #dc2626",
        color: "#7f1d1d",
        outline: "1.5px dashed #dc2626",
        outlineOffset: "-2px",
      } as React.CSSProperties;
    return {
      background: `hsl(${h} 85% ${s.done ? 90 : 94}%)`,
      borderLeft: `4px solid hsl(${h} 65% 42%)`,
      color: `hsl(${h} 60% 18%)`,
    } as React.CSSProperties;
  };

  const tab = (v: string, text: React.ReactNode, Icon: typeof Table2) => (
    <Link
      href={q({ view: v })}
      className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs sm:text-sm md:h-9 md:flex-none md:px-3 ${
        view === v ? "border-orange-600 bg-orange-600 text-white" : "bg-white hover:bg-slate-50"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      {text}
    </Link>
  );

  // Liên kết xuất Excel theo ngữ cảnh đang xem.
  const excelHref = term
    ? (() => {
        const p = new URLSearchParams({ term: term.id });
        if (staff) {
          if (fClass) {
            p.set("type", "class");
            p.set("id", fClass);
          } else if (fTeacher) {
            p.set("type", "teacher");
            p.set("id", fTeacher);
          } else p.set("type", view === "teacher" ? "all-teachers" : "all-classes");
        } else if (isTeacher) {
          p.set("type", "teacher");
          p.set("id", me.teacherId!);
        } else if (learnerEnrollment) {
          p.set("type", "class");
          p.set("id", learnerEnrollment.schoolClassId);
        } else if (slots[0]) {
          p.set("type", "class");
          p.set("id", slots[0].schoolClassId);
        } else return null;
        p.set("w", isoDate(start));
        return `/lich-hoc/xuat-excel?${p}`;
      })()
    : null;

  const btnPrimary =
    "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-orange-600 px-3 text-sm font-medium text-white hover:bg-orange-700 sm:h-9";

  if (!term) {
    return (
      <div className="space-y-4">
        <Title><span className="inline-flex flex-wrap items-center gap-3">{scheduleLabel(me.roles)}{versionBadge}</span></Title>
        <Card className="text-sm text-slate-500">
          Chưa có học kỳ nào.{" "}
          {me.roles.includes("ADMIN") ? (
            <>
              Tạo học kỳ ở mục{" "}
              <Link href="/cau-hinh" className="font-medium text-orange-700 hover:underline">
                Cấu hình
              </Link>{" "}
              để bắt đầu xếp thời khóa biểu.
            </>
          ) : (
            "Liên hệ quản trị viên để tạo học kỳ."
          )}
        </Card>
      </div>
    );
  }

  /* =========================================================================
     GIAO DIỆN DÀNH RIÊNG CHO HỌC SINH (Học sinh chỉ học 1 lớp duy nhất)
     ========================================================================= */
  if (isLearner) {
    const studentClass = learnerEnrollment?.schoolClass;
    const weekCols = days.slice(0, 6); // Thứ 2 -> Thứ 7

    // Tạo bản đồ tra cứu slot theo (dayOfWeek, periodNo)
    // Lưu ý: dayOfWeek trong TimetableSlot là 2 (T2) .. 7 (T7)
    const slotMap = new Map<string, S>();
    for (const s of sessions) {
      slotMap.set(`${s.slot.dayOfWeek}-${s.slot.periodNo}`, s);
    }

    // Ngày được chọn trên Mobile (mặc định hôm nay nếu trong tuần, hoặc Thứ 2)
    const selIso =
      sp.d && days.some((x) => isoDate(x) === sp.d)
        ? sp.d
        : days.some((x) => x.getTime() === today.getTime())
        ? isoDate(today)
        : isoDate(days[0]);
    const selDay = days.find((x) => isoDate(x) === selIso)!;
    const daySessions = sessions.filter((x) => isoDate(x.date) === selIso);
    const SHORT_DAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

    return (
      <div className="space-y-4">
        {/* Tiêu đề & Điều hướng tuần */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Thời khóa biểu của tôi</h1>
            <p className="text-xs text-slate-500">
              {term.termName} · Năm học {term.academicYear.yearName}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-white p-0.5">
              <Link
                className="inline-flex size-8 items-center justify-center rounded hover:bg-slate-100"
                href={q({ w: isoDate(step(-1)) })}
                aria-label="Tuần trước"
              >
                <ChevronLeft className="size-4" />
              </Link>
              <span className="px-2 text-xs font-medium sm:text-sm">{label}</span>
              <Link
                className="inline-flex size-8 items-center justify-center rounded hover:bg-slate-100"
                href={q({ w: isoDate(step(1)) })}
                aria-label="Tuần sau"
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>

            <Link className={`${btnPrimary} schedule-today`} href={q({ w: isoDate(today) })}>
              Hôm nay
            </Link>

            {excelHref && (
              <a
                href={excelHref} download title="Tải thời khóa biểu Excel" aria-label="Tải thời khóa biểu Excel"
                className="inline-flex size-9 items-center justify-center rounded-md border bg-white hover:bg-slate-50"
              >
                <Download className="size-4" />
              </a>
            )}
          </div>
        </div>

        {/* Thông tin lớp học của học sinh */}
        {studentClass ? (
          <Card className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-orange-50 via-white to-orange-50/40 p-4 border-orange-200">
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-orange-600 text-white shadow-sm">
                <GraduationCap className="size-6" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">Lớp {studentClass.className}</h2>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                    {studentClass.gradeLevel.gradeName}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>
                    GVCN:{" "}
                    <b className="text-slate-800">
                      {studentClass.homeroomTeacher?.fullName ?? "Chưa phân công"}
                    </b>
                  </span>
                  <span>
                    Sĩ số: <b className="text-slate-800">{studentClass._count.enrollments} học sinh</b>
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              💡 Bấm vào từng tiết học để xem phòng học và thông tin bài học
            </div>
          </Card>
        ) : (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Bạn chưa được xếp vào lớp học nào trong học kỳ này. Vui lòng liên hệ Giáo viên chủ nhiệm
            hoặc Ban giám hiệu để được xếp lớp.
          </Card>
        )}

        {/* ================= GIAO DIỆN DI ĐỘNG (MOBILE) ================= */}
        <div className="space-y-3 md:hidden">
          {/* Thanh chọn thứ trong tuần */}
          <div className="grid grid-cols-6 gap-1">
            {weekCols.map((d) => {
              const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay() + 1; // 2..7
              const count = sessions.filter((x) => x.slot.dayOfWeek === dow).length;
              const on = isoDate(d) === selIso;
              const isCurrentDay = d.getTime() === today.getTime();

              return (
                <Link
                  key={d.getTime()}
                  href={q({ d: isoDate(d) })}
                  scroll={false}
                  className={`flex flex-col items-center rounded-lg border py-2 text-center transition-colors ${
                    on
                      ? "border-orange-600 bg-orange-600 text-white shadow-sm"
                      : isCurrentDay
                      ? "border-orange-300 bg-orange-50 text-orange-950"
                      : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-[11px] font-semibold">{SHORT_DAYS[d.getUTCDay()]}</span>
                  <span className="text-base font-bold leading-tight">{d.getUTCDate()}</span>
                  <span className={`text-[10px] ${on ? "text-orange-100" : "text-slate-400"}`}>
                    {count ? `${count} tiết` : "Nghỉ"}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-sm font-semibold">
            <span>
              {WEEKDAYS[selDay.getUTCDay()]}, {fmtDate(selDay)}
              {selDay.getTime() === today.getTime() ? " · Hôm nay" : ""}
            </span>
            <span className="text-xs font-normal text-slate-500">
              {daySessions.length} tiết học
            </span>
          </div>

          {/* Danh sách các tiết học của ngày được chọn */}
          <ul className="space-y-2">
            {daySessions.map((s) => {
              const h = hue(s.slot.assignment.subjectId);
              const pTime = PERIOD_TIMES[s.slot.periodNo]?.time ?? "";

              return (
                <li key={s.key}>
                  <DialogTrigger
                    title={`Tiết ${s.slot.periodNo} · ${s.slot.assignment.subject.subjectName}`}
                    className="block w-full overflow-hidden rounded-lg border bg-white text-left shadow-sm transition-all hover:shadow"
                    style={{ borderLeft: `5px solid hsl(${h} 65% 45%)` }}
                    trigger={
                      <div className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                              Tiết {s.slot.periodNo}
                            </span>
                            <span className="text-xs text-slate-500">{pTime}</span>
                          </div>
                          <div className="mt-1 text-base font-bold text-slate-900 truncate">
                            {s.slot.assignment.subject.subjectName}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-600">
                            <span>GV: {s.slot.assignment.teacher.fullName}</span>
                            <span>Phòng: {s.slot.room.roomName}</span>
                          </div>
                        </div>

                        {s.done && (
                          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                            Đã học
                          </span>
                        )}
                      </div>
                    }
                  >
                    <Detail s={s} />
                  </DialogTrigger>
                </li>
              );
            })}

            {!daySessions.length && (
              <li className="rounded-lg border bg-white py-10 text-center text-sm text-slate-500">
                Không có tiết học nào trong ngày này. Bạn được nghỉ! 🎉
              </li>
            )}
          </ul>
        </div>

        {/* ================= BẢNG THỜI KHÓA BIỂU MA TRẬN (DESKTOP) ================= */}
        {/* Hàng = Tiết 1..10 (sáng 1-5, chiều 6-10), Cột = Thứ 2 .. Thứ 7 */}
        <div className="content-panel hidden overflow-hidden rounded-xl border bg-white shadow-sm md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-100/80 text-xs font-semibold text-slate-700">
                <th className="w-36 border-r px-3 py-3 text-center uppercase tracking-wide">
                  Tiết học
                </th>
                {weekCols.map((d) => {
                  const isCurrentDay = d.getTime() === today.getTime();
                  return (
                    <th
                      key={d.getTime()}
                      className={`border-r px-3 py-2.5 text-center last:border-r-0 ${
                        isCurrentDay ? "bg-orange-100/90 text-orange-950 font-bold" : ""
                      }`}
                    >
                      <div className="text-xs font-medium text-slate-500">
                        {WEEKDAYS[d.getUTCDay()]}
                      </div>
                      <div className={`text-base font-bold ${isCurrentDay ? "text-orange-700" : ""}`}>
                        {d.getUTCDate()}/{d.getUTCMonth() + 1}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* Tiêu đề phân cách: BUỔI SÁNG */}
              <tr className="bg-orange-50/50">
                <td
                  colSpan={7}
                  className="border-b px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-orange-800"
                >
                  🌅 Buổi sáng (Tiết 1 – Tiết 5)
                </td>
              </tr>

              {[1, 2, 3, 4, 5].map((period) => {
                const pInfo = PERIOD_TIMES[period];
                return (
                  <tr key={period} className="border-b hover:bg-slate-50/50">
                    <td className="border-r bg-slate-50/40 px-3 py-2 text-center align-middle">
                      <div className="font-bold text-slate-800">Tiết {period}</div>
                      <div className="text-[11px] text-slate-500">{pInfo.time}</div>
                    </td>

                    {weekCols.map((d) => {
                      const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay() + 1; // 2..7
                      const s = slotMap.get(`${dow}-${period}`);
                      const isCurrentDay = d.getTime() === today.getTime();

                      return (
                        <td
                          key={d.getTime()}
                          className={`border-r p-1.5 align-middle last:border-r-0 ${
                            isCurrentDay ? "bg-orange-50/30" : ""
                          }`}
                        >
                          {s ? (
                            <DialogTrigger
                              title={`Tiết ${period} · ${s.slot.assignment.subject.subjectName}`}
                              className="group block w-full rounded-lg p-2 text-left transition-all hover:scale-[1.01] hover:shadow-md"
                              style={tone(s)}
                              trigger={
                                <div>
                                  <div className="font-bold leading-tight truncate">
                                    {s.slot.assignment.subject.subjectName}
                                  </div>
                                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-700">
                                    <span className="truncate">{s.slot.assignment.teacher.fullName}</span>
                                    <span className="font-semibold text-slate-800 shrink-0 ml-1">
                                      {s.slot.room.roomName}
                                    </span>
                                  </div>
                                </div>
                              }
                            >
                              <Detail s={s} />
                            </DialogTrigger>
                          ) : (
                            <div className="h-12 w-full rounded border border-dashed border-slate-200/60" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Tiêu đề phân cách: BUỔI CHIỀU */}
              <tr className="bg-sky-50/50">
                <td
                  colSpan={7}
                  className="border-b px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-sky-800"
                >
                  🌤️ Buổi chiều (Tiết 6 – Tiết 10)
                </td>
              </tr>

              {[6, 7, 8, 9, 10].map((period) => {
                const pInfo = PERIOD_TIMES[period];
                return (
                  <tr key={period} className="border-b hover:bg-slate-50/50 last:border-b-0">
                    <td className="border-r bg-slate-50/40 px-3 py-2 text-center align-middle">
                      <div className="font-bold text-slate-800">Tiết {period}</div>
                      <div className="text-[11px] text-slate-500">{pInfo.time}</div>
                    </td>

                    {weekCols.map((d) => {
                      const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay() + 1; // 2..7
                      const s = slotMap.get(`${dow}-${period}`);
                      const isCurrentDay = d.getTime() === today.getTime();

                      return (
                        <td
                          key={d.getTime()}
                          className={`border-r p-1.5 align-middle last:border-r-0 ${
                            isCurrentDay ? "bg-orange-50/30" : ""
                          }`}
                        >
                          {s ? (
                            <DialogTrigger
                              title={`Tiết ${period} · ${s.slot.assignment.subject.subjectName}`}
                              className="group block w-full rounded-lg p-2 text-left transition-all hover:scale-[1.01] hover:shadow-md"
                              style={tone(s)}
                              trigger={
                                <div>
                                  <div className="font-bold leading-tight truncate">
                                    {s.slot.assignment.subject.subjectName}
                                  </div>
                                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-700">
                                    <span className="truncate">{s.slot.assignment.teacher.fullName}</span>
                                    <span className="font-semibold text-slate-800 shrink-0 ml-1">
                                      {s.slot.room.roomName}
                                    </span>
                                  </div>
                                </div>
                              }
                            >
                              <Detail s={s} />
                            </DialogTrigger>
                          ) : (
                            <div className="h-12 w-full rounded border border-dashed border-slate-200/60" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* =========================================================================
     GIAO DIỆN DÀNH CHO GIÁO VIÊN VÀ QUẢN LÝ (Nhiều lớp / Nhiều giáo viên)
     ========================================================================= */
  return (
    <div className="space-y-4">
      <Title
        mobileActions="visible"
        right={
          <div className="schedule-week-toolbar grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm md:flex md:w-auto md:flex-wrap">
            <Link
              className="inline-flex size-9 items-center justify-center rounded-md border bg-white hover:bg-slate-50"
              href={q({ w: isoDate(step(-1)) })}
              aria-label="Trước"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-0 whitespace-nowrap text-center text-xs font-medium tabular-nums sm:min-w-44 sm:text-sm">
              {label}
            </span>
            <Link
              className="inline-flex size-9 items-center justify-center rounded-md border bg-white hover:bg-slate-50"
              href={q({ w: isoDate(step(1)) })}
              aria-label="Sau"
            >
              <ChevronRight className="size-4" />
            </Link>
            <div className="hidden md:contents">
            <Link className={`${btnPrimary} schedule-today`} href={q({ w: isoDate(today) })}>
              Hôm nay
            </Link>
            {staff && <Link className={`${btnPrimary} schedule-create`} href={`/lich-hoc/tu-dong?term=${term.id}&w=${isoDate(start)}`}>+ Tạo thời khóa biểu mới</Link>}
            {excelHref && <a href={excelHref} download title="Tải thời khóa biểu Excel" aria-label="Tải thời khóa biểu Excel" className="schedule-download inline-flex size-10 shrink-0 items-center justify-center rounded-md border bg-white hover:bg-slate-50 sm:size-9"><Download className="size-4" /></a>}
            </div>
          </div>
        }
      >
        <span className="inline-flex flex-wrap items-center gap-3">{scheduleLabel(me.roles)}{versionBadge}<span className="text-sm font-normal text-slate-500">· {term.termName} · {term.academicYear.yearName}</span></span>
      </Title>

      {sp.created === "1" && <p role="status" className="text-sm text-green-700">Đã tạo thời khóa biểu mới. Lịch cũ vẫn được giữ lại cho các tuần trước.</p>}

      <div className="schedule-view-toolbar grid grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-2 md:flex md:flex-wrap md:items-center">
        {hasMine && (
          <div className="col-span-2 flex overflow-hidden rounded-md border bg-white text-sm md:mr-2">
            <Link
              href={q({ scope: "mine" })}
              className={`inline-flex h-9 items-center px-3 ${
                scope === "mine" ? "bg-orange-600 text-white" : "hover:bg-slate-50"
              }`}
            >
              Lịch của tôi
            </Link>
            <Link
              href={q({ scope: "all" })}
              className={`inline-flex h-9 items-center border-l px-3 ${
                scope === "all" ? "bg-orange-600 text-white" : "hover:bg-slate-50"
              }`}
            >
              Tất cả
            </Link>
          </div>
        )}
        <div className="hidden md:contents">
        {tab(
          "class",
          <>
            <span className="md:hidden">Theo ngày</span>
            <span className="hidden md:inline">Theo lớp</span>
          </>,
          Table2,
        )}
        {canFilter && (
          <>
            {tab("teacher", "Theo giáo viên", User)}
            {tab("room", "Theo phòng", DoorOpen)}
          </>
        )}
        {tab("list", "Danh sách", LayoutList)}
        </div>
        {canFilter && (
          <AutoForm
            className="min-w-0 md:ml-auto md:flex md:flex-wrap md:items-center md:gap-2"
            resets={{ grade: ["class"] }}
          >
            <select key={view} name="view" defaultValue={view} className={`${inputCls} md:hidden`} aria-label="Kiểu xem thời khóa biểu">
              <option value="class">Theo ngày</option>
              <option value="teacher">Theo giáo viên</option>
              <option value="room">Theo phòng</option>
              <option value="list">Danh sách</option>
            </select>
            {terms.length <= 1 && <input type="hidden" name="term" value={term.id} />}
            <input type="hidden" name="w" value={isoDate(base)} />
            {hasMine && <input type="hidden" name="scope" value={scope} />}
            <MobileCollapse active={[fGrade, fRoom, fClass, fTeacher].filter(Boolean).length}>
              {terms.length > 1 && (
                <SearchableSelect key={term.id} name="term" defaultValue={term.id} ariaLabel="Học kỳ" className="w-full md:w-52" options={terms.map((t) => ({ value: t.id, label: `${t.termName} · ${t.academicYear.yearName}` }))} />
              )}
              {(view === "class" || view === "list") && (
                <SearchableSelect key={fGrade} name="grade" defaultValue={fGrade} emptyLabel="Tất cả khối" ariaLabel="Khối" className="w-full md:w-44" options={grades.map((g) => ({ value: g.id, label: g.gradeName }))} />
              )}
              {(view === "room" || view === "list") && (
                <SearchableSelect key={fRoom} name="room" defaultValue={fRoom} emptyLabel="Tất cả phòng" ariaLabel="Phòng" className="w-full md:w-44" options={rooms.map((r) => ({ value: r.id, label: r.roomName }))} />
              )}
              {(view === "class" || view === "list") && (
                <SearchableSelect key={fClass} name="class" defaultValue={fClass} emptyLabel="Tất cả lớp" ariaLabel="Lớp" className="w-full md:w-44" options={classes.map((c) => ({ value: c.id, label: c.className }))} />
              )}
              {(view === "teacher" || view === "list") && (
                <SearchableSelect key={fTeacher} name="teacher" defaultValue={fTeacher} emptyLabel="Tất cả giáo viên" ariaLabel="Giáo viên" className="w-full md:w-52" options={teachers.map((t) => ({ value: t.id, label: t.fullName }))} />
              )}
              {(fGrade || fRoom || fClass || fTeacher) && (
                <Link
                  href={`/lich-hoc?view=${view}&w=${isoDate(base)}&term=${term.id}${
                    hasMine ? `&scope=${scope}` : ""
                  }`}
                  className="inline-flex h-9 items-center rounded-md px-2 text-sm text-slate-500 hover:text-orange-700"
                >
                  Xoá lọc
                </Link>
              )}
            </MobileCollapse>
          </AutoForm>
        )}
        <div className="md:hidden">
          <ActionMenu label="Thao tác thời khóa biểu">
            <Link href={q({ w: isoDate(today) })} className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-slate-50">Về hôm nay</Link>
            {staff && <Link href={`/lich-hoc/tu-dong?term=${term.id}&w=${isoDate(start)}`} className="flex min-h-10 items-center rounded-md px-3 text-sm text-orange-700 hover:bg-slate-50">Tạo thời khóa biểu</Link>}
            {excelHref && <a href={excelHref} download className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm hover:bg-slate-50"><Download className="size-4 shrink-0" />Tải Excel</a>}
          </ActionMenu>
        </div>
      </div>

      {/* ===== LƯỚI TUẦN: hàng = lớp / giáo viên / phòng, cột = Thứ 2–7 ===== */}
      {view !== "list" &&
        (() => {
          const cols = days.slice(0, 6);
          const group = (x: S) =>
            view === "teacher"
              ? {
                  id: x.slot.assignment.teacherId,
                  name: x.slot.assignment.teacher.fullName,
                  sub: `${
                    new Set(
                      sessions
                        .filter((y) => y.slot.assignment.teacherId === x.slot.assignment.teacherId)
                        .map((y) => y.slot.schoolClass.className),
                    ).size
                  } lớp`,
                }
              : view === "room"
              ? {
                  id: x.slot.roomId,
                  name: x.slot.room.roomName,
                  sub: `Sức chứa ${x.slot.room.capacity}`,
                }
              : {
                  id: x.slot.schoolClassId,
                  name: x.slot.schoolClass.className,
                  sub: `${x.slot.schoolClass.gradeLevel.gradeName} · GVCN: ${
                    x.slot.schoolClass.homeroomTeacher?.fullName ?? "-"
                  }`,
                };
          const rows = [
            ...new Map(sessions.map((x) => [group(x).id, group(x)])).values(),
          ].sort((a, b) => a.name.localeCompare(b.name, "vi"));
          const byKey = new Map<string, S[]>();
          for (const x of sessions) {
            const k = `${group(x).id}|${x.date.getTime()}`;
            byKey.set(k, [...(byKey.get(k) ?? []), x]);
          }
          const rowLabel = view === "teacher" ? "Giáo viên" : view === "room" ? "Phòng" : "Lớp";
          const selIso =
            sp.d && days.some((x) => isoDate(x) === sp.d)
              ? sp.d
              : days.some((x) => x.getTime() === today.getTime())
              ? isoDate(today)
              : isoDate(days[0]);
          const selDay = days.find((x) => isoDate(x) === selIso)!;
          const dayList = sessions.filter((x) => isoDate(x.date) === selIso);
          const SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
          const chip = (x: S) =>
            `${isOverdue(x) || clash.has(x.key) ? "⚠ " : ""}T${x.slot.periodNo} · ${
              view === "class"
                ? x.slot.assignment.subject.subjectName
                : view === "teacher"
                ? `${x.slot.assignment.subject.subjectName} (${x.slot.schoolClass.className})`
                : `${x.slot.schoolClass.className} · ${x.slot.assignment.subject.subjectName}`
            }${x.done ? " ✓" : ""}`;

          return (
            <>
              {/* Điện thoại */}
              <div className="space-y-3 md:hidden">
                <div className="grid grid-cols-7 gap-1">
                  {days.map((d) => {
                    const n = sessions.filter((x) => x.date.getTime() === d.getTime()).length;
                    const on = isoDate(d) === selIso,
                      isToday = d.getTime() === today.getTime();
                    return (
                      <Link
                        key={d.getTime()}
                        href={q({ d: isoDate(d) })}
                        scroll={false}
                        className={`flex flex-col items-center rounded-lg border py-1.5 text-center ${
                          on
                            ? "border-orange-600 bg-orange-600 text-white"
                            : isToday
                            ? "border-orange-300 bg-orange-50"
                            : "bg-white"
                        }`}
                      >
                        <span className="text-[11px]">{SHORT[d.getUTCDay()]}</span>
                        <span className="text-base font-bold leading-tight">{d.getUTCDate()}</span>
                        <span className={`text-[10px] ${on ? "text-orange-100" : "text-slate-500"}`}>
                          {n ? `${n} tiết` : "—"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <div className="text-sm font-semibold">
                  {WEEKDAYS[selDay.getUTCDay()]}, {fmtDate(selDay)}
                  {selDay.getTime() === today.getTime() ? " · Hôm nay" : ""}{" "}
                  <span className="font-normal text-slate-500">· {dayList.length} tiết</span>
                </div>
                <ul className="space-y-2">
                  {dayList.map((s) => {
                    const [stLabel, stTone] = isOverdue(s)
                      ? ["Quá ngày", "bg-red-100 text-red-600"]
                      : s.slot.kind === "activity" ? ["Hoạt động cố định", "bg-sky-100 text-sky-800"] : STATUS_BADGE[s.done ? "DONE" : "PLANNED"];
                    const bar = isOverdue(s)
                      ? "#dc2626"
                      : `hsl(${hue(s.slot.assignment.subjectId)} 65% 42%)`;
                    return (
                      <li key={s.key}>
                        <DialogTrigger
                          title={`${s.slot.schoolClass.className} · ${s.slot.assignment.subject.subjectName}`}
                          className="block w-full overflow-hidden rounded-lg border bg-white text-left"
                          style={{ borderLeft: `4px solid ${bar}` }}
                          trigger={
                            <span className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1 p-2.5">
                              <span className="text-xs font-semibold tabular-nums">Tiết {s.slot.periodNo}</span>
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">
                                  {s.slot.schoolClass.className} · {s.slot.assignment.subject.subjectName}
                                </span>
                                <span className="block text-xs text-slate-500">
                                  {s.slot.assignment.teacher.fullName} · {s.slot.room.roomName}
                                </span>
                              </span>
                              <span
                                className={`col-start-2 justify-self-start rounded px-1.5 py-0.5 text-[11px] font-medium ${stTone}`}
                              >
                                {stLabel}
                              </span>
                            </span>
                          }
                        >
                          <Detail s={s} />
                        </DialogTrigger>
                      </li>
                    );
                  })}
                  {!dayList.length && (
                    <li className="rounded-lg border bg-white py-8 text-center text-sm text-slate-500">
                      Không có tiết học nào trong ngày này.
                    </li>
                  )}
                </ul>
              </div>

              {/* Desktop */}
              <div className="hidden max-h-[calc(100vh-12rem)] overflow-auto rounded-lg border bg-white md:block">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs">
                      <th className="sticky left-0 top-0 z-30 w-56 border-b bg-slate-50 px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">
                        {rowLabel} ({rows.length})
                      </th>
                      {cols.map((d) => {
                        const isToday = d.getTime() === today.getTime();
                        const n = sessions.filter((x) => x.date.getTime() === d.getTime()).length;
                        return (
                          <th
                            key={d.getTime()}
                            className={`sticky top-0 z-20 border-b border-l px-1 py-1.5 text-center font-normal ${
                              isToday ? "bg-orange-100" : "bg-slate-50"
                            }`}
                          >
                            <div className="block">
                              <div className="text-slate-500">{WEEKDAYS[d.getUTCDay()]}</div>
                              <div
                                className={`text-base font-bold leading-tight ${
                                  isToday ? "text-orange-700" : ""
                                }`}
                              >
                                {d.getUTCDate()}/{d.getUTCMonth() + 1}
                              </div>
                              <div className="text-[11px] text-slate-500">{n} tiết</div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-slate-50/60">
                        <td className="sticky left-0 z-10 border-r bg-white px-3 py-1.5 align-middle">
                          {staff && view === "class" ? (
                            <Link
                              href={`/lop-hoc/${r.id}`}
                              className="block truncate font-semibold hover:text-orange-700"
                              title={r.name}
                            >
                              {r.name}
                            </Link>
                          ) : (
                            <span className="block truncate font-semibold" title={r.name}>
                              {r.name}
                            </span>
                          )}
                          <div className="truncate text-[11px] text-slate-500">{r.sub}</div>
                        </td>
                        {cols.map((d) => {
                          const list = byKey.get(`${r.id}|${d.getTime()}`) ?? [];
                          const isToday = d.getTime() === today.getTime();
                          return (
                            <td
                              key={d.getTime()}
                              className={`border-l px-1 py-1 align-top ${
                                isToday ? "bg-orange-50/60" : ""
                              }`}
                            >
                              {list.map((x) => (
                                <DialogTrigger
                                  key={x.key}
                                  title={`${x.slot.schoolClass.className} · ${x.slot.assignment.subject.subjectName}`}
                                  className="mb-0.5 block w-full rounded px-1.5 py-1 text-center text-xs font-medium last:mb-0"
                                  style={tone(x)}
                                  trigger={<span>{chip(x)}</span>}
                                >
                                  <Detail s={x} />
                                </DialogTrigger>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-500">
                          Không có tiết học nào trong tuần này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

      {/* ===== DANH SÁCH (tuần) ===== */}
      {view === "list" && (
        <div className="space-y-3">
          {days.map((d) => {
            const list = sessions.filter((s) => s.date.getTime() === d.getTime());
            if (!list.length) return null;
            const isToday = d.getTime() === today.getTime();
            return (
              <div key={d.getTime()} className="item-card overflow-hidden rounded-lg border bg-white">
                <div
                  className={`flex items-center justify-between px-4 py-2 text-sm font-semibold ${
                    isToday ? "bg-orange-100 text-orange-800" : "bg-slate-50"
                  }`}
                >
                  <span>
                    {WEEKDAYS[d.getUTCDay()]}, {fmtDate(d)}
                    {isToday && " · Hôm nay"}
                  </span>
                  <span className="font-normal text-slate-500">{list.length} tiết</span>
                </div>
                <ul className="divide-y">
                  {list.map((s) => (
                    <li
                      key={s.key}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5"
                      style={{
                        borderLeft: `4px solid hsl(${hue(s.slot.assignment.subjectId)} 65% 42%)`,
                      }}
                    >
                      <div className="w-20 text-sm font-semibold tabular-nums">
                        Tiết {s.slot.periodNo}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {s.slot.schoolClass.className} · {s.slot.assignment.subject.subjectName}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {s.slot.assignment.teacher.fullName} · {s.slot.room.roomName}{" "}
                          {isLearner ? "" : `· ${s.slot.schoolClass._count.enrollments} HS`}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isOverdue(s)
                            ? "bg-red-100 text-red-600"
                            : s.done
                            ? "bg-green-100 text-green-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isOverdue(s) ? "Quá ngày" : s.slot.kind === "activity" ? "Cố định" : s.done ? "Đã ghi sổ" : "Chưa ghi sổ"}
                      </span>
                      <DialogTrigger
                        title={`${s.slot.schoolClass.className} · ${s.slot.assignment.subject.subjectName}`}
                        trigger="Chi tiết"
                        className="h-8 rounded-md border bg-white px-3 text-sm hover:bg-slate-50"
                      >
                        <Detail s={s} />
                      </DialogTrigger>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!sessions.length && (
            <p className="rounded-lg border bg-white py-10 text-center text-sm text-slate-500">
              Không có tiết học nào trong tuần này.
            </p>
          )}
        </div>
      )}

    </div>
  );
}
