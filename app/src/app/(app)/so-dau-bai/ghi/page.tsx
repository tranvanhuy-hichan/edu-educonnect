import { isVersionEffective } from "@/modules/scheduling/effective";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, Title } from "@/components/ui";
import { WEEKDAYS, fmtDate, parseDate, todayUTC } from "@/lib/format";
import { weekNumber } from "@/lib/week";
import { TEACHER_EDIT_DAYS } from "@/modules/attendance/attendance.service";
import { saveLog } from "../actions";

const RATING: Record<string, string> = { TOT: "Tốt", KHA: "Khá", TB: "Trung bình", YEU: "Yếu" };

/** Ghi sổ đầu bài một tiết trong một ngày — mở khi bấm vào hàng ở trang Sổ đầu bài. */
export default async function DiaryEntry({ searchParams }: { searchParams: Promise<{ slot?: string; d?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const { slot: slotId, d } = await searchParams;
  if (!slotId || !d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) notFound();
  const day = parseDate(d);
  const slot = await db.timetableSlot.findUnique({
    where: { id: slotId },
    include: { version: true, schoolClass: { include: { academicYear: true, _count: { select: { enrollments: true } } } }, assignment: { include: { subject: true, teacher: true } }, room: true },
  });
  if (!slot || !isVersionEffective(slot.version, day)) notFound();
  const dow = day.getUTCDay() === 0 ? 8 : day.getUTCDay() + 1;
  if (dow !== slot.dayOfWeek) notFound();

  const staff = me.roles.some((r) => MANAGER_ROLES.includes(r));
  if (!staff) {
    const ok = slot.schoolClass.homeroomTeacherId === me.teacherId || (await db.classSubjectAssignment.count({ where: { schoolClassId: slot.schoolClassId, teacherId: me.teacherId ?? "-" } })) > 0;
    if (!ok) notFound();
  }

  const log = await db.classPeriodLog.findUnique({ where: { timetableSlotId_logDate: { timetableSlotId: slot.id, logDate: day } } });
  const today = todayUTC();
  const future = day.getTime() > today.getTime();
  const tooOld = (today.getTime() - day.getTime()) / 86400_000 > TEACHER_EDIT_DAYS;
  const mine = staff || (!!me.teacherId && slot.assignment.teacherId === me.teacherId);
  const locked = !staff && (future || tooOld);
  const wk = weekNumber(slot.schoolClass.academicYear.startDate, day);
  const size = slot.schoolClass._count.enrollments;
  const stat = (label: string, value: React.ReactNode) => <Card className="p-3"><div className="text-xs text-slate-500">{label}</div><div className="font-semibold">{value}</div></Card>;

  return (
    <div className="space-y-4">
      <Title>Sổ đầu bài · {slot.schoolClass.className} · Tiết {slot.periodNo}</Title>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-5">
        {stat("Ngày", `${WEEKDAYS[day.getUTCDay()]}, ${fmtDate(day)}`)}
        {stat("Môn", slot.assignment.subject.subjectName)}
        {stat("Giáo viên", slot.assignment.teacher.fullName)}
        {stat("Phòng", slot.room.roomName)}
        {stat("Sĩ số", `${size} học sinh`)}
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">{log ? "Sổ đầu bài đã ghi" : "Chưa ghi sổ đầu bài"}</h2>
        {mine && !locked ? (
          <ActionForm action={saveLog} submit="Lưu sổ đầu bài" reset={false} className="flex max-w-lg flex-col gap-3 [&>button]:self-start">
            <input type="hidden" name="slotId" value={slot.id} /><input type="hidden" name="date" value={d} />
            <Field label={`Số học sinh vắng (sĩ số ${size})`}><input type="number" name="absent" min={0} max={size} defaultValue={log?.attendanceAbsentCount ?? 0} className={inputCls + " w-full"} /></Field>
            <Field label="Xếp loại tiết học"><select name="conductRating" defaultValue={log?.conductRating ?? ""} className={inputCls + " w-full"}><option value="">-- chưa xếp loại --</option>{Object.entries(RATING).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Nhận xét"><textarea name="note" defaultValue={log?.note ?? ""} rows={4} className={inputCls + " h-auto w-full py-2"} /></Field>
          </ActionForm>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-slate-500">{!mine ? "Bạn chỉ được xem tiết này." : future ? "Chưa đến ngày nên chưa thể ghi sổ." : `Đã quá ${TEACHER_EDIT_DAYS} ngày, giáo viên không thể sửa — liên hệ quản lý.`}</p>
            {log && <dl className="grid max-w-lg grid-cols-2 gap-3"><div><dt className="text-xs text-slate-500">Vắng</dt><dd className="font-semibold">{log.attendanceAbsentCount}</dd></div><div><dt className="text-xs text-slate-500">Xếp loại</dt><dd className="font-semibold">{log.conductRating ? RATING[log.conductRating] : "—"}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Nhận xét</dt><dd>{log.note ?? "—"}</dd></div></dl>}
          </div>
        )}
      </Card>
    </div>
  );
}
