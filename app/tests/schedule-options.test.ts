import assert from "node:assert/strict";
import { test } from "node:test";
import { parseScheduleOptions, scheduleWithOptions, type ScheduleOptions, type SchedulingClass } from "../src/modules/scheduling/options";
import { DAYS } from "../src/modules/scheduling/auto-schedule";
const classes: SchedulingClass[] = [
  { id: "c10", className: "10A1", gradeLevelId: "g10", roomId: "r10", shift: "AFTERNOON" },
  { id: "c12", className: "12A1", gradeLevelId: "g12", roomId: "r12", shift: "MORNING" },
];
const rooms = [{ id: "r10", capacity: 40 }, { id: "r12", capacity: 40 }];
const assignments = classes.map((cls) => ({ id: `math-${cls.id}`, subjectId: "math", schoolClassId: cls.id, teacherId: `t-${cls.id}`, roomId: cls.roomId, periodsPerWeek: 4 }));
const options = (): ScheduleOptions => ({ grades: classes.map((cls) => ({ gradeLevelId: cls.gradeLevelId, days: DAYS.map((dayOfWeek) => ({ dayOfWeek, morning: cls.id === "c12" ? 5 : 0, afternoon: cls.id === "c10" ? 5 : 0 })) })), fixed: [] });
const input = { classes, rooms, assignments };
const rule = { name: "Chào cờ", subjectId: null, gradeLevelId: null, dayOfWeek: 2, periodNo: 2, length: 1 };

test("grade-specific sessions and individual daily limits", () => {
  const config = options(); config.grades[0].days[0].afternoon = 2; config.grades[0].days[1].afternoon = 0;
  const { result } = scheduleWithOptions(input, config);
  assert.equal(result.unplaced.length, 0);
  for (const slot of result.placements) {
    assert.ok(slot.schoolClassId === "c10" ? slot.periodNo >= 6 : slot.periodNo <= 5);
    if (slot.schoolClassId === "c10" && slot.dayOfWeek === 2) assert.ok(slot.periodNo <= 7);
    assert.ok(!(slot.schoolClassId === "c10" && slot.dayOfWeek === 3));
  }
});
test("assembly reserves all classes without reducing subject quotas", () => {
  const config = options(); config.fixed.push(rule);
  const { result, activities } = scheduleWithOptions(input, config);
  assert.equal(activities.length, 2); assert.equal(result.placements.length, 8);
  assert.ok(result.placements.every((slot) => slot.dayOfWeek !== 2 || slot.periodNo !== 2));
});
test("fixed subject periods 6–7 are preserved and counted toward the weekly quota", () => {
  const config = options(); config.fixed.push({ name: "Trải nghiệm", subjectId: "experience", gradeLevelId: "g10", dayOfWeek: 2, periodNo: 6, length: 2 });
  const experience = { id: "exp10", subjectId: "experience", schoolClassId: "c10", teacherId: "homeroom10", roomId: "r10", periodsPerWeek: 3 };
  const { result } = scheduleWithOptions({ ...input, assignments: [...assignments, experience] }, config);
  const slots = result.placements.filter((slot) => slot.assignmentId === "exp10");
  assert.equal(slots.length, 3); assert.equal(slots.filter((slot) => slot.dayOfWeek === 2 && [6, 7].includes(slot.periodNo)).length, 2);
  assert.equal(result.unplaced.length, 0);
});
test("reject overlapping fixed events, missing assignments and cross-session ranges", () => {
  const config = options(); config.fixed = [rule, { ...rule }];
  assert.throws(() => scheduleWithOptions(input, config), /trùng nhau/);
  config.fixed = [{ ...rule, subjectId: "unknown" }]; assert.throws(() => scheduleWithOptions(input, config), /chưa phân công giáo viên/);
  config.fixed = [{ ...rule, periodNo: 5, length: 2 }]; assert.throws(() => scheduleWithOptions(input, config), /cùng một buổi/);
});
test("fixed subjects must fit daily availability and weekly quotas", () => {
  const config = options(); config.fixed = [{ ...rule, name: "Toán", subjectId: "math", gradeLevelId: "g10", periodNo: 1 }];
  assert.throws(() => scheduleWithOptions(input, config), /nằm ngoài buổi/);
  config.fixed[0].periodNo = 6; config.fixed[0].length = 5; assert.throws(() => scheduleWithOptions(input, config), /vượt số tiết/);
});
test("fixed lessons reject shared-teacher conflicts", () => {
  const config = options(); config.grades[1].days.forEach((day) => { day.afternoon = 5; });
  config.fixed = [{ ...rule, name: "Toán", subjectId: "math", periodNo: 6 }];
  assert.throws(() => scheduleWithOptions({ ...input, classes: classes.map((cls) => ({ ...cls, shift: "AFTERNOON" })), assignments: assignments.map((item) => ({ ...item, teacherId: "shared" })) }, config), /giáo viên hoặc phòng bị trùng/);
});
test("validate JSON, day uniqueness, all grades, and unplaced accounting", () => {
  assert.throws(() => parseScheduleOptions("bad"));
  const config = options(); config.grades[0].days[0].morning = 6;
  assert.throws(() => parseScheduleOptions(JSON.stringify(config)));
  config.grades[0].days[0].morning = 0; config.grades[0].days[0].dayOfWeek = 3;
  assert.throws(() => scheduleWithOptions(input, config), /không lặp ngày/);
  config.grades.pop(); assert.throws(() => scheduleWithOptions(input, config));
  const closed = options(); closed.grades.forEach((grade) => grade.days.forEach((day) => { day.morning = 0; day.afternoon = 0; }));
  const result = scheduleWithOptions(input, closed).result;
  assert.equal(result.placements.length, 0); assert.equal(result.unplaced.reduce((sum, item) => sum + item.missing, 0), 8);
});

test("fixed activities can target one class without affecting its peers", () => {
  const config = options();
  config.fixed = [{ ...rule, classId: "c10" }];
  const { activities } = scheduleWithOptions({ ...input, classes: [...classes, { ...classes[0], id: "c10b", className: "10A2" }] }, config);
  assert.deepEqual(activities.map((activity) => activity.schoolClassId), ["c10"]);
  config.fixed = [{ ...rule, classId: "missing" }];
  assert.throws(() => scheduleWithOptions(input, config), /không tìm thấy lớp/);
  config.fixed = [{ ...rule, gradeLevelId: "g10", classId: "c12" }];
  assert.throws(() => scheduleWithOptions(input, config), /chỉ chọn một phạm vi/);
});

test("a subject can be pinned for just one class", () => {
  const config = options();
  config.fixed = [{ ...rule, name: "Toán", subjectId: "math", classId: "c10", periodNo: 6, length: 2 }];
  const { result } = scheduleWithOptions(input, config);
  assert.equal(result.unplaced.length, 0);
  assert.equal(result.placements.filter((slot) => slot.schoolClassId === "c10" && slot.dayOfWeek === 2 && [6, 7].includes(slot.periodNo)).length, 2);
  assert.equal(result.placements.filter((slot) => slot.assignmentId === "math-c10").length, 4);
});

test("catalog grades without any classes can still be configured", () => {
  const config = options();
  const result = scheduleWithOptions({ classes: [classes[0]], rooms, assignments: [assignments[0]], grades: [{ id: "g10" }, { id: "g12" }] }, config);
  assert.equal(result.result.unplaced.length, 0);
  assert.equal(result.result.placements.length, 4);
});

test("class shifts restrict placements even when both sessions are open", () => {
  const config = options();
  config.grades.forEach((grade) => grade.days.forEach((day) => { day.morning = 5; day.afternoon = 5; }));
  const { result } = scheduleWithOptions(input, config);
  assert.equal(result.unplaced.length, 0);
  for (const cls of classes) {
    const slots = result.placements.filter((slot) => slot.schoolClassId === cls.id);
    assert.equal(slots.length, 4);
    assert.ok(slots.every((slot) => cls.shift === "MORNING" ? slot.periodNo <= 5 : slot.periodNo >= 6));
    const wrongSession = cls.shift === "MORNING" ? 6 : 1;
    assert.throws(() => scheduleWithOptions(input, {
      ...config,
      fixed: [{ ...rule, name: "Toán", subjectId: "math", classId: cls.id, periodNo: wrongSession }],
    }), /nằm ngoài buổi/);
  }
});
