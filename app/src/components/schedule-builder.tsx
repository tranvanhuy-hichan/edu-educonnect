"use client";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { TimetableWeekField } from "@/components/timetable-week-field";
import { ScheduleMatrix } from "@/components/schedule-matrix";
import { Card, inputCls } from "@/components/ui";
import { DAYS } from "@/modules/scheduling/auto-schedule";
import { scheduleOptionsSchema, type ScheduleOptions } from "@/modules/scheduling/options";
import type { computeAutoSchedule } from "@/modules/scheduling/scheduling.service";
import { previewSchedule, saveAutoSchedule } from "@/app/(app)/lich-hoc/actions";

type Preview = Awaited<ReturnType<typeof computeAutoSchedule>>;
type Grade = { id: string; gradeName: string };
const counts = [0, 1, 2, 3, 4, 5];

export function ScheduleBuilder({ term, grades, classes, subjects, initial, selected }: {
  term: { id: string; startDate: Date; endDate: Date; academicYear: { startDate: Date } };
  classes: { id: string; className: string; gradeLevelId: string; shift?: "MORNING" | "AFTERNOON"; subjectIds: string[] }[];
  grades: Grade[]; subjects: { id: string; subjectName: string }[]; initial?: ScheduleOptions; selected?: Date;
}) {
  const [options, setOptions] = useState<ScheduleOptions>(() => ({
    grades: grades.map((grade) => {
      const existing = initial?.grades.find((item) => item.gradeLevelId === grade.id);
      const gradeClasses = classes.filter((cls) => cls.gradeLevelId === grade.id);
      const hasAfternoon = gradeClasses.some((cls) => cls.shift === "AFTERNOON");
      const hasMorning = gradeClasses.some((cls) => cls.shift !== "AFTERNOON") || (!hasAfternoon && gradeClasses.length === 0);

      if (existing) {
        return {
          gradeLevelId: grade.id,
          days: existing.days.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            morning: hasMorning ? d.morning : 0,
            afternoon: hasAfternoon ? d.afternoon : 0,
          })),
        };
      }
      return {
        gradeLevelId: grade.id,
        days: DAYS.map((dayOfWeek) => ({
          dayOfWeek,
          morning: hasMorning ? 5 : 0,
          afternoon: hasAfternoon ? 5 : 0,
        })),
      };
    }),
    fixed: initial?.fixed ?? [],
  }));
  const [response, action, pending] = useActionState(previewSchedule, null);
  const normalized = scheduleOptionsSchema.safeParse(options);
  const encoded = JSON.stringify(normalized.success ? normalized.data : options);
  const returned: Preview | null = response?.data?.preview ? JSON.parse(response.data.preview) : null;
  const preview = returned && JSON.stringify(returned.options) === encoded ? returned : null;
  const missing = preview?.result.unplaced.reduce((sum, item) => sum + item.missing, 0) ?? 0;
  const addRule = () => setOptions((value) => ({ ...value, fixed: [...value.fixed, { name: "Hoạt động chung", gradeLevelId: null, classId: null, subjectId: null, dayOfWeek: 2, periodNo: 1, length: 1 }] }));
  function editRule(index: number, patch: Partial<ScheduleOptions["fixed"][number]>) {
    setOptions((value) => ({ ...value, fixed: value.fixed.map((rule, i) => i === index ? { ...rule, ...patch } : rule) }));
  }

  return <div className="space-y-4">
    <form action={action} className="space-y-4">
      <input type="hidden" name="termId" value={term.id} /><input type="hidden" name="options" value={encoded} />
      <Card className="space-y-4">
        <h2 className="font-semibold">1. Buổi học và số tiết từng ngày theo khối</h2>
        <p className="text-sm text-slate-500">
          Chỉ hiển thị buổi học tương ứng với ca học của các lớp trong từng khối. Buổi sáng gồm tiết 1–5 (lớp ca sáng), buổi chiều gồm tiết 6–10 (lớp ca chiều). Chọn 0 để nghỉ buổi đó.
        </p>
        {grades.map((grade) => {
          const config = options.grades.find((item) => item.gradeLevelId === grade.id)!;
          const gradeClasses = classes.filter((cls) => cls.gradeLevelId === grade.id);
          const morningCount = gradeClasses.filter((cls) => cls.shift !== "AFTERNOON").length;
          const afternoonCount = gradeClasses.filter((cls) => cls.shift === "AFTERNOON").length;
          const shiftSummary = morningCount && afternoonCount
            ? `${morningCount} lớp sáng · ${afternoonCount} lớp chiều`
            : morningCount
              ? `${morningCount} lớp sáng`
              : afternoonCount
                ? `${afternoonCount} lớp chiều`
                : "";
          const showMorning = morningCount > 0 || (morningCount === 0 && afternoonCount === 0);
          const showAfternoon = afternoonCount > 0;
          const sessionsToShow = (["morning", "afternoon"] as const).filter((session) => (session === "morning" ? showMorning : showAfternoon));
          const sessions = config.days.reduce((sum, day) => sum + (showMorning ? Number(day.morning > 0) : 0) + (showAfternoon ? Number(day.afternoon > 0) : 0), 0);
          return <fieldset key={grade.id} className="item-card rounded-lg border p-3">
            <legend className="px-2 text-sm font-semibold">{grade.gradeName} {shiftSummary ? `(${shiftSummary})` : ""} · {sessions} buổi/tuần</legend>
            <div className="overflow-x-auto"><table className="w-full text-center text-sm"><thead><tr><th className="p-2 text-left">Buổi / số tiết</th>{DAYS.map((day) => <th key={day} className="min-w-24 p-2">Thứ {day}</th>)}</tr></thead>
              <tbody>{sessionsToShow.map((session) => <tr key={session}><th className="p-2 text-left font-medium">{session === "morning" ? "Sáng" : "Chiều"}</th>{DAYS.map((day) => <td key={day} className="p-1"><select aria-label={`${grade.gradeName}, thứ ${day}, ${session === "morning" ? "sáng" : "chiều"}`} value={config.days.find((item) => item.dayOfWeek === day)![session]} className={inputCls + " w-full"} onChange={(event) => setOptions((value) => ({ ...value, grades: value.grades.map((item) => item.gradeLevelId === grade.id ? { ...item, days: item.days.map((row) => row.dayOfWeek === day ? { ...row, [session]: Number(event.target.value) } : row) } : item) }))}>{counts.map((count) => <option key={count} value={count}>{count ? `${count} tiết` : "Nghỉ"}</option>)}</select></td>)}</tr>)}</tbody>
            </table></div>
          </fieldset>;
        })}
      </Card>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">2. Các tiết cố định hằng tuần</h2><button type="button" onClick={() => addRule()} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"><Plus className="size-4" />Thêm tiết cố định</button></div>
        <p className="text-sm text-slate-500">Hoạt động chung giữ chỗ cho lớp, không tính vào tiết môn học và có thể nằm ngoài buổi học thường lệ. Chọn môn đã phân công để cố định môn đó và trừ đúng số tiết/tuần.</p>

        {options.fixed.map((rule, index) => {
          const scopeClasses = classes.filter((cls) => rule.classId ? cls.id === rule.classId : !rule.gradeLevelId || cls.gradeLevelId === rule.gradeLevelId);
          const scopeSubjects = subjects.filter((subject) => scopeClasses.length > 0 && scopeClasses.every((cls) => cls.subjectIds.includes(subject.id)));
          return <fieldset key={index} className="item-card grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs">Tên hoạt động / tiết cố định<input value={rule.name} required maxLength={100} onChange={(event) => editRule(index, { name: event.target.value })} className={inputCls + " mt-1 w-full"} /></label>
          <label className="text-xs">Phạm vi<select value={rule.classId ? `class:${rule.classId}` : rule.gradeLevelId ? `grade:${rule.gradeLevelId}` : "all"} onChange={(event) => { const [type, id] = event.target.value.split(":"); editRule(index, { gradeLevelId: type === "grade" ? id : null, classId: type === "class" ? id : null }); }} className={inputCls + " mt-1 w-full"}><option value="all">Toàn trường</option><optgroup label="Theo khối">{grades.map((grade) => <option key={grade.id} value={`grade:${grade.id}`}>{grade.gradeName}</option>)}</optgroup><optgroup label="Theo lớp">{classes.map((cls) => <option key={cls.id} value={`class:${cls.id}`}>Lớp {cls.className} ({cls.shift === "AFTERNOON" ? "Ca chiều" : "Ca sáng"})</option>)}</optgroup></select></label>
          <label className="text-xs">Loại tiết<select value={rule.subjectId ?? ""} onChange={(event) => { const subject = subjects.find((item) => item.id === event.target.value); editRule(index, { subjectId: subject?.id ?? null, ...(subject ? { name: subject.subjectName } : {}) }); }} className={inputCls + " mt-1 w-full"}><option value="">Hoạt động chung (không phải môn học)</option>{rule.subjectId && !scopeSubjects.some((subject) => subject.id === rule.subjectId) && <option value={rule.subjectId} disabled>Môn đã chọn không thuộc phạm vi lớp</option>}{scopeSubjects.map((subject) => <option key={subject.id} value={subject.id}>Môn: {subject.subjectName}</option>)}</select></label>
          <label className="text-xs">Thứ<select value={rule.dayOfWeek} onChange={(event) => editRule(index, { dayOfWeek: Number(event.target.value) })} className={inputCls + " mt-1 w-full"}>{DAYS.map((day) => <option key={day} value={day}>Thứ {day}</option>)}</select></label>
          <label className="text-xs">Tiết bắt đầu<select value={rule.periodNo} onChange={(event) => editRule(index, { periodNo: Number(event.target.value) })} className={inputCls + " mt-1 w-full"}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>Tiết {i + 1} · {i < 5 ? "Sáng" : "Chiều"}</option>)}</select></label>
          <div className="flex items-end gap-2"><label className="flex-1 text-xs">Số tiết liên tiếp<select value={rule.length} onChange={(event) => editRule(index, { length: Number(event.target.value) })} className={inputCls + " mt-1 w-full"}>{counts.filter(Boolean).map((count) => <option key={count} value={count}>{count} tiết</option>)}</select></label><button type="button" aria-label={`Xóa tiết cố định ${index + 1}`} onClick={() => setOptions((value) => ({ ...value, fixed: value.fixed.filter((_, i) => i !== index) }))} className="h-9 rounded-md border px-2 text-red-600"><Trash2 className="size-4" /></button></div>
        </fieldset>; })}
        {!options.fixed.length && <p className="text-sm text-slate-400">Chưa có tiết cố định.</p>}
      </Card>
      <button disabled={pending || !grades.length} className="rounded-md bg-coral-600 px-4 py-2 text-sm font-semibold text-white hover:bg-coral-700 disabled:opacity-50">{pending ? "Đang xếp lịch..." : "Xếp lịch & xem trước"}</button>
      {response?.error && <p role="alert" className="text-sm text-red-600">{response.error}</p>}
    </form>
    {!preview && returned && <p className="text-sm text-slate-500">Cấu hình đã thay đổi. Bấm “Xếp lịch & xem trước” để tính lại.</p>}
    {preview && <div className="space-y-4">
      <h2 className="font-semibold">3. Xem trước thời khóa biểu</h2>
      <p className="text-sm">Đã xếp {preview.result.placements.length} tiết môn học, {preview.activities.length} tiết hoạt động chung. {missing > 0 ? `Còn thiếu ${missing} tiết môn học.` : "Đã xếp đủ tiết."}</p>
      <ScheduleMatrix preview={preview} />
      {missing > 0 ? <Card className="space-y-2 text-sm text-red-600"><p>Chưa thể tạo lịch vì chưa xếp đủ tiết. Hãy điều chỉnh buổi học, số tiết, phân công hoặc các tiết cố định.</p><ul className="list-inside list-disc">{preview.result.unplaced.map((item) => { const assignment = preview.assignments.find((a) => a.id === item.assignmentId); return <li key={item.assignmentId}>{assignment?.schoolClass.className} · {assignment?.subject.subjectName}: thiếu {item.missing} tiết · {item.reason}</li>; })}</ul></Card> : preview.result.placements.length > 0 && <Card mobile="flat"><ActionForm action={saveAutoSchedule} submit="Tạo thời khóa biểu theo cấu hình này" reset={false} className="flex flex-col gap-3"><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="options" value={encoded} /><TimetableWeekField term={term} selected={selected} /><p className="text-xs text-slate-500">Cấu hình và các tiết cố định được lưu cùng phiên bản. Lịch cũ được giữ nguyên.</p></ActionForm></Card>}
    </div>}
  </div>;
}
