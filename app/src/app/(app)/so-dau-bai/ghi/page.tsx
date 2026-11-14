import { isVersionEffective } from "@/modules/scheduling/effective";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { Card } from "@/components/ui";
import { CalendarDays, DoorOpen, GraduationCap, NotebookPen, Users } from "lucide-react";
import { getPolicy } from "@/lib/policy";
import { ratingText, ratingTone } from "@/lib/policy-schema";
import { DiaryForm } from "./diary-form";
import { WEEKDAYS, fmtDate, parseDate, todayUTC } from "@/lib/format";
import { weekNumber } from "@/lib/week";
import { TEACHER_EDIT_DAYS } from "@/modules/attendance/attendance.service";

/** Ghi sổ đầu bài một tiết trong một ngày — mở khi bấm vào hàng ở trang Sổ đầu bài. */
export default async function DiaryEntry({ searchParams }: { searchParams: Promise<{ slot?: string; d?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const { slot: slotId, d } = await searchParams;
  if (!slotId || !d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) notFound();
  const day = parseDate(d);
  const slot = await db.timetableSlot.findUnique({
    where: { id: slotId },
    include: { version: true, schoolClass: { include: { academicYear: true, _count: { select: { enrollments: true } } } }, assignment: { include: { subject: true, teacher: { select: { id: true, fullName: true } } } }, room: true },
  });
  if (!slot || !isVersionEffective(slot.version, day)) notFound();
  const dow = day.getUTCDay() === 0 ? 8 : day.getUTCDay() + 1;
  if (dow !== slot.dayOfWeek) notFound();

  const staff = me.roles.some((r) => MANAGER_ROLES.includes(r));
  if (!staff) {
    const ok = slot.schoolClass.homeroomTeacherId === me.teacherId || (await db.classSubjectAssignment.count({ where: { schoolClassId: slot.schoolClassId, teacherId: me.teacherId ?? "-" } })) > 0;
    if (!ok) notFound();
  }

  const policy = await getPolicy();
  const [log, recent, roster] = await Promise.all([
    db.classPeriodLog.findUnique({ where: { timetableSlotId_logDate: { timetableSlotId: slot.id, logDate: day } }, include: { absences: true } }),
    // các tiết gần đây của cùng lớp và môn: để giáo viên nối tiếp nội dung bài dạy
    db.classPeriodLog.findMany({ where: { timetableSlot: { assignmentId: slot.assignmentId }, logDate: { lt: day } }, orderBy: { logDate: "desc" }, take: 5 }),
    db.studentClassEnrollment.findMany({ where: { schoolClassId: slot.schoolClassId }, select: { studentId: true, student: { select: { id: true, fullName: true, code: true } } } }),
  ]);
  const today = todayUTC();
  const future = day.getTime() > today.getTime();
  const tooOld = (today.getTime() - day.getTime()) / 86400_000 > TEACHER_EDIT_DAYS;
  const mine = staff || (!!me.teacherId && slot.assignment.teacherId === me.teacherId);
  const locked = !staff && (future || tooOld);
  const wk = weekNumber(slot.schoolClass.academicYear.startDate, day);
  const size = roster.length;
  const absentOf = new Map(log?.absences.map((a) => [a.studentId, a.excused ? "EXCUSED" as const : "UNEXCUSED" as const]));
  const students = roster.map((e) => e.student).sort((x, y) => x.fullName.localeCompare(y.fullName, "vi")).map((s) => ({ id: s.id, name: s.fullName, code: s.code ?? "", status: absentOf.get(s.id) ?? ("" as const) }));
  const absentNames = students.filter((s) => s.status);
  const chip = (Icon: typeof Users, text: React.ReactNode) => <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-slate-500"><Icon className="size-4 shrink-0" /><span className="truncate text-inherit">{text}</span></span>;

  return (
    <div className="w-full space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">{slot.assignment.subject.subjectName} · Lớp {slot.schoolClass.className}</h1>
            <p className="text-sm text-slate-500">Tiết {slot.periodNo}{wk ? ` · Tuần ${wk}` : ""}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${log ? "bg-green-500/15 text-green-700" : "bg-amber-500/15 text-amber-700"}`}>{log && <NotebookPen className="size-3.5" />}{log ? "Đã ghi sổ" : "Chưa ghi sổ"}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 sm:flex sm:flex-wrap sm:gap-x-5">
          {chip(CalendarDays, `${WEEKDAYS[day.getUTCDay()]}, ${fmtDate(day)}`)}
          {chip(GraduationCap, slot.assignment.teacher.fullName)}
          {chip(DoorOpen, `Phòng ${slot.room.roomName}`)}
          {chip(Users, `${size} học sinh`)}
        </div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card mobile="flat">
          {mine && !locked ? (
            <DiaryForm slotId={slot.id} date={d} roster={students} ratings={policy.diaryRatings} initial={{ lessonTitle: log?.lessonTitle ?? "", rating: log?.conductRating ?? "", note: log?.note ?? "", absent: log?.attendanceAbsentCount ?? 0 }} />
          ) : (
            <div className="space-y-4 text-sm">
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700">{!mine ? "Bạn chỉ được xem tiết này." : future ? "Chưa đến ngày nên chưa thể ghi sổ." : `Đã quá ${TEACHER_EDIT_DAYS} ngày, giáo viên không thể sửa — liên hệ quản lý.`}</p>
              {log ? <dl className="space-y-4">
                <div><dt className="text-xs text-slate-500">Tên bài / nội dung</dt><dd className="font-semibold">{log.lessonTitle ?? "-"}</dd></div>
                <div><dt className="text-xs text-slate-500">Xếp loại tiết học</dt><dd>{log.conductRating ? <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ratingTone(policy.diaryRatings, log.conductRating)}`}>{ratingText(policy.diaryRatings, log.conductRating)}</span> : "-"}</dd></div>
                <div><dt className="text-xs text-slate-500">Nhận xét</dt><dd className="whitespace-pre-line">{log.note ?? "-"}</dd></div>
                <div><dt className="text-xs text-slate-500">Vắng ({log.attendanceAbsentCount}/{size})</dt><dd>{absentNames.length ? <ul className="mt-1 space-y-1">{absentNames.map((s) => <li key={s.id}>{s.name} <span className={`ml-1 rounded px-1.5 py-0.5 text-[11px] ${s.status === "EXCUSED" ? "bg-amber-500/15 text-amber-700" : "bg-red-500/15 text-red-700"}`}>{s.status === "EXCUSED" ? "Có phép" : "Không phép"}</span></li>)}</ul> : "Không có"}</dd></div>
              </dl> : <p className="text-slate-500">Tiết này chưa có sổ đầu bài.</p>}
            </div>
          )}
        </Card>

        <Card className="space-y-1 lg:sticky lg:top-4">
          <h2 className="text-sm font-semibold">Các tiết trước của môn này</h2>
          {recent.length ? <ol className="relative ml-1.5 mt-2 space-y-4 border-l pl-4">{recent.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-orange-500" />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="text-sm font-medium">{fmtDate(r.logDate)}</div>{r.lessonTitle ? <div className="text-xs text-slate-500">{r.lessonTitle}</div> : null}<div className="text-xs text-slate-500">Vắng {r.attendanceAbsentCount}</div></div>
                {r.conductRating && <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${ratingTone(policy.diaryRatings, r.conductRating)}`}>{ratingText(policy.diaryRatings, r.conductRating).split(" · ")[0]}</span>}
              </div>
            </li>))}</ol> : <p className="text-xs text-slate-500">Chưa có tiết nào trước đó.</p>}
        </Card>
      </div>
    </div>
  );
}
