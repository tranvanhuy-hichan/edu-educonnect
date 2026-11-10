"use client";
import type { computeAutoSchedule } from "@/modules/scheduling/scheduling.service";
import { DAYS } from "@/modules/scheduling/auto-schedule";
type Preview = Awaited<ReturnType<typeof computeAutoSchedule>>;
const SESSIONS = [{ label: "Buổi sáng", periods: [1, 2, 3, 4, 5] }, { label: "Buổi chiều", periods: [6, 7, 8, 9, 10] }];
export function ScheduleMatrix({ preview }: { preview: Preview }) {
  const { assignments, rooms, classes, result, activities } = preview;
  const assignmentOf = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const roomOf = new Map(rooms.map((room) => [room.id, room.roomName]));
  const slotOf = new Map(result.placements.map((slot) => [`${slot.schoolClassId}|${slot.dayOfWeek}|${slot.periodNo}`, slot]));
  const activityOf = new Map(activities.map((activity) => [`${activity.schoolClassId}|${activity.dayOfWeek}|${activity.periodNo}`, activity]));
  return <div className="space-y-4">
    {classes.length > 0 && SESSIONS.filter((session) => session.periods[0] === 1 || (result.placements.some((slot) => slot.periodNo > 5) || activities.some((activity) => activity.periodNo > 5))).map((session) => <section key={session.label} className="space-y-2">
      <h2 className="text-sm font-semibold">{session.label}</h2>
      <div className="content-panel overflow-x-auto rounded-lg border bg-white">
      <table className="w-full border-separate border-spacing-0 text-center text-xs">
        <caption className="sr-only">Xem trước thời khóa biểu: mỗi hàng là một thứ, mỗi lớp gồm 5 cột tiết</caption>
        <thead>
          <tr><th rowSpan={2} className="sticky left-0 z-20 min-w-20 border-b border-r bg-white px-3 py-3">Thứ</th>{classes.map((cls) => <th key={cls.id} colSpan={5} scope="colgroup" className="border-b border-r bg-orange-50 px-3 py-3 text-sm font-semibold text-orange-800">{cls.className} <span className="text-xs font-normal text-orange-600">({cls.shift === "AFTERNOON" ? "Chiều" : "Sáng"})</span></th>)}</tr>
          <tr>{classes.flatMap((cls) => session.periods.map((period) => <th key={`${cls.id}-${period}`} scope="col" className={`min-w-20 border-b px-2 py-2 font-medium text-slate-500 ${period === session.periods[4] ? "border-r" : ""}`}>Tiết {period}</th>))}</tr>
        </thead>
        <tbody>{DAYS.map((day) => <tr key={day}>
          <th scope="row" className="sticky left-0 z-10 border-b border-r bg-white px-3 py-4 font-semibold">Thứ {day}</th>
          {classes.flatMap((cls) => session.periods.map((period) => {
            const slot = slotOf.get(`${cls.id}|${day}|${period}`);
            const activity = activityOf.get(`${cls.id}|${day}|${period}`);
            const previous = slotOf.get(`${cls.id}|${day}|${period - 1}`);
            const next = slotOf.get(`${cls.id}|${day}|${period + 1}`);
            const same = (other: typeof slot) => !!slot && !!other && slot.assignmentId === other.assignmentId && slot.roomId === other.roomId;
            // Merge runs in pairs, preserving the five-period grid for each class.
            let runStart = period;
            while (runStart > session.periods[0] && same(slotOf.get(`${cls.id}|${day}|${runStart - 1}`))) runStart--;
            if (same(previous) && (period - runStart) % 2 === 1) return null;
            const paired = same(next) && period < session.periods[4];
            const assignment = slot && assignmentOf.get(slot.assignmentId);
            return <td key={`${cls.id}-${period}`} colSpan={paired ? 2 : 1} className={`border-b p-1 align-top ${period + (paired ? 1 : 0) === session.periods[4] ? "border-r" : ""}`}>
              {assignment && slot ? <div title={`${assignment.subject.subjectName} · ${assignment.teacher.fullName} · ${roomOf.get(slot.roomId)}`} className={`flex min-h-24 flex-col justify-center gap-1 rounded-md px-2 py-2 ${paired ? "bg-orange-100 text-orange-900 ring-1 ring-inset ring-orange-200" : "bg-slate-50 text-slate-700"}`}>
                <span className="font-semibold">{assignment.subject.subjectName}</span>
                <span className="text-[11px]">{assignment.teacher.fullName}</span>
                <span className="text-[10px] opacity-75">{roomOf.get(slot.roomId)}{paired ? " · Tiết đôi" : ""}</span>
              </div> : activity ? <div className="flex min-h-24 items-center justify-center rounded-md border border-sky-200 bg-sky-50 p-2 font-semibold text-sky-800">{activity.name}<span className="sr-only"> · Cố định</span></div> : <div className="flex min-h-24 items-center justify-center text-slate-300">—</div>}
            </td>;
          }))}
        </tr>)}</tbody>
      </table>
    </div></section>)}
  </div>;
}
