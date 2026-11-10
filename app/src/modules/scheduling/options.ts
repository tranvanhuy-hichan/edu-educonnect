import { z } from "zod";
import { autoSchedule, type AutoAssignment, type AutoRoom, type AutoSlot } from "./auto-schedule";

const daySchema = z.object({ dayOfWeek: z.number().int().min(2).max(7), morning: z.number().int().min(0).max(5), afternoon: z.number().int().min(0).max(5) });
export const scheduleOptionsSchema = z.object({
  grades: z.array(z.object({ gradeLevelId: z.string().min(1), days: z.array(daySchema).length(6) })).max(100),
  fixed: z.array(z.object({ name: z.string().trim().min(1).max(100), gradeLevelId: z.string().nullable(), classId: z.string().nullable().optional(), subjectId: z.string().nullable(), dayOfWeek: z.number().int().min(2).max(7), periodNo: z.number().int().min(1).max(10), length: z.number().int().min(1).max(5) })).max(100),
});
export type ScheduleOptions = z.infer<typeof scheduleOptionsSchema>;
export type SchedulingClass = { id: string; className: string; gradeLevelId: string; roomId: string | null; shift: "MORNING" | "AFTERNOON" };
export type SchedulingAssignment = AutoAssignment & { subjectId: string };
export type Activity = { schoolClassId: string; name: string; dayOfWeek: number; periodNo: number };

export function parseScheduleOptions(value: string): ScheduleOptions {
  if (value.length > 100000) throw new Error("Cấu hình thời khóa biểu quá lớn");
  try { return scheduleOptionsSchema.parse(JSON.parse(value)); }
  catch { throw new Error("Cấu hình không hợp lệ. Mỗi ngày cần số tiết từ 0 đến 5 cho từng buổi."); }
}

/** Shared by preview and save: validate hard constraints before running the solver. */
export function scheduleWithOptions(input: { classes: SchedulingClass[]; assignments: SchedulingAssignment[]; rooms: AutoRoom[]; grades?: { id: string }[] }, options: ScheduleOptions) {
  const gradeIds = new Set(input.grades?.map((grade) => grade.id) ?? input.classes.map((cls) => cls.gradeLevelId));
  const configuredGrades = new Set<string>();
  const allowedPeriods: Record<string, Record<number, number[]>> = {};
  for (const grade of options.grades) {
    if (!gradeIds.has(grade.gradeLevelId) || configuredGrades.has(grade.gradeLevelId)) throw new Error("Khối trong cấu hình không hợp lệ hoặc bị lặp");
    configuredGrades.add(grade.gradeLevelId);
    if (new Set(grade.days.map((day) => day.dayOfWeek)).size !== 6) throw new Error("Mỗi khối cần cấu hình đủ thứ 2 đến thứ 7, không lặp ngày");
    for (const cls of input.classes.filter((cls) => cls.gradeLevelId === grade.gradeLevelId)) {
      const isMorning = cls.shift === "MORNING";
      allowedPeriods[cls.id] = Object.fromEntries(
        grade.days.map((day) => [
          day.dayOfWeek,
          isMorning
            ? Array.from({ length: day.morning }, (_, i) => i + 1)
            : Array.from({ length: day.afternoon }, (_, i) => i + 6),
        ])
      );
    }
  }
  if ([...gradeIds].some((id) => !configuredGrades.has(id))) throw new Error("Cần cấu hình buổi học cho tất cả các khối");
  const activities: Activity[] = [];
  const fixedLessons: AutoSlot[] = [];
  const occupied = new Set<string>();
  const teachers = new Set<string>();
  const rooms = new Set<string>();
  const pinnedCount = new Map<string, number>();
  for (const rule of options.fixed) {
    const last = rule.periodNo + rule.length - 1;
    if (last > 10 || Math.floor((last - 1) / 5) !== Math.floor((rule.periodNo - 1) / 5)) throw new Error(`${rule.name}: các tiết cố định phải nằm trong cùng một buổi`);
    if (rule.classId && rule.gradeLevelId) throw new Error(`${rule.name}: chỉ chọn một phạm vi lớp hoặc khối`);
    const classes = input.classes.filter((cls) => rule.classId ? cls.id === rule.classId : !rule.gradeLevelId || cls.gradeLevelId === rule.gradeLevelId);
    if (!classes.length) throw new Error(`${rule.name}: không tìm thấy lớp thuộc phạm vi đã chọn`);
    for (const cls of classes) {
      const assignment = rule.subjectId ? input.assignments.find((assignment) => assignment.schoolClassId === cls.id && assignment.subjectId === rule.subjectId) : null;
      if (rule.subjectId && !assignment) throw new Error(`${cls.className}: chưa phân công giáo viên cho môn cố định ${rule.name}`);
      for (let periodNo = rule.periodNo; periodNo <= last; periodNo++) {
        const time = `${rule.dayOfWeek}|${periodNo}`;
        const classKey = `${cls.id}|${time}`;
        if (occupied.has(classKey)) throw new Error(`${cls.className}: có tiết cố định trùng nhau vào thứ ${rule.dayOfWeek}, tiết ${periodNo}`);
        occupied.add(classKey);
        if (assignment) {
          if (!allowedPeriods[cls.id][rule.dayOfWeek].includes(periodNo)) throw new Error(`${cls.className}: môn cố định ${rule.name} nằm ngoài buổi/số tiết đã cấu hình`);
          if (!cls.roomId) throw new Error(`${cls.className}: chưa có phòng học cố định`);
          if (teachers.has(`${assignment.teacherId}|${time}`) || rooms.has(`${cls.roomId}|${time}`)) throw new Error(`${rule.name}: giáo viên hoặc phòng bị trùng ở thứ ${rule.dayOfWeek}, tiết ${periodNo}`);
          teachers.add(`${assignment.teacherId}|${time}`); rooms.add(`${cls.roomId}|${time}`);
          pinnedCount.set(assignment.id, (pinnedCount.get(assignment.id) ?? 0) + 1);
          fixedLessons.push({ assignmentId: assignment.id, teacherId: assignment.teacherId, schoolClassId: cls.id, roomId: cls.roomId, dayOfWeek: rule.dayOfWeek, periodNo });
        } else {
          // Common activities can be outside normal lesson sessions (e.g. school assembly).
          activities.push({ schoolClassId: cls.id, name: rule.name, dayOfWeek: rule.dayOfWeek, periodNo });
        }
      }
    }
  }
  for (const assignment of input.assignments) if ((pinnedCount.get(assignment.id) ?? 0) > assignment.periodsPerWeek) throw new Error("Số tiết môn được cố định vượt số tiết/tuần đã cấu hình");
  const result = autoSchedule({ assignments: input.assignments.map((assignment) => ({ ...assignment, preferPairs: assignment.periodsPerWeek > 2, periodsPerWeek: assignment.periodsPerWeek - (pinnedCount.get(assignment.id) ?? 0) })), rooms: input.rooms, fixed: fixedLessons, blocked: activities, allowedPeriods });
  return { result: { ...result, placements: [...fixedLessons, ...result.placements] }, activities };
}
