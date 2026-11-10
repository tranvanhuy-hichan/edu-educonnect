import assert from "node:assert/strict";
import { test } from "node:test";
import { autoSchedule, type AutoSlot, type AutoAssignment } from "../src/modules/scheduling/auto-schedule";

const rooms = [{ id: "r1", capacity: 40 }, { id: "r2", capacity: 40 }];
const assignment = (id: string, periodsPerWeek: number, schoolClassId = "c1", teacherId = "t1"): AutoAssignment => ({ id, periodsPerWeek, schoolClassId, teacherId, roomId: schoolClassId === "c2" ? "r2" : schoolClassId === "c3" ? "r3" : schoolClassId === "c0" ? "r4" : "r1" });

function noConflicts(slots: AutoSlot[]) {
  for (const dimension of ["schoolClassId", "teacherId", "roomId"] as const) {
    const keys = slots.map((slot) => `${slot[dimension]}|${slot.dayOfWeek}|${slot.periodNo}`);
    assert.equal(new Set(keys).size, slots.length, `Conflict: ${dimension}`);
  }
}

for (const count of [3, 4, 5, 6]) {
  test(`${count} periods form double lessons, with one single for odd counts`, () => {
    const result = autoSchedule({ assignments: [assignment("a1", count)], rooms });
    assert.equal(result.unplaced.length, 0);
    assert.equal(result.placements.length, count);
    const days = new Map<number, AutoSlot[]>();
    for (const slot of result.placements) days.set(slot.dayOfWeek, [...(days.get(slot.dayOfWeek) ?? []), slot]);
    assert.equal([...days.values()].filter((slots) => slots.length === 2).length, Math.floor(count / 2));
    for (const slots of days.values()) {
      if (slots.length !== 2) continue;
      slots.sort((a, b) => a.periodNo - b.periodNo);
      assert.equal(slots[1].periodNo, slots[0].periodNo + 1);
      assert.equal(slots[0].roomId, slots[1].roomId);
      assert.equal(Math.floor((slots[0].periodNo - 1) / 5), Math.floor((slots[1].periodNo - 1) / 5));
    }
    noConflicts(result.placements);
  });
}

test("multiple classes sharing teachers remain conflict-free and deterministic", () => {
  const assignments = Array.from({ length: 4 }, (_, c) => Array.from({ length: 5 }, (_, subject) => assignment(`a${c}-${subject}`, 4, `c${c}`, `t${subject}`))).flat();
  const input = { assignments, rooms: [...rooms, { id: "r3", capacity: 40 }, { id: "r4", capacity: 40 }] };
  const result = autoSchedule(input);
  assert.equal(result.unplaced.length, 0);
  assert.equal(result.placements.length, 80);
  noConflicts(result.placements);
  assert.deepEqual(autoSchedule(input), result);
});

test("double lessons never span morning and afternoon; fixed periods remain occupied", () => {
  const fixed: AutoSlot[] = [];
  for (let day = 2; day <= 7; day++) for (const periodNo of [1, 2, 3, 4, 7, 8, 9, 10]) {
    fixed.push({ assignmentId: "fixed", schoolClassId: "c1", teacherId: "t2", roomId: "r1", dayOfWeek: day, periodNo });
  }
  const result = autoSchedule({ assignments: [assignment("a1", 4)], rooms, fixed });
  assert.equal(result.unplaced.length, 0);
  noConflicts([...fixed, ...result.placements]);
  for (const day of new Set(result.placements.map((slot) => slot.dayOfWeek))) {
    // The only free periods are 5 and 6, so prefer single lessons on different days.
    assert.equal(result.placements.filter((slot) => slot.dayOfWeek === day).length, 1);
  }
});

test("unplaced periods are reported, and smaller assignments can still be filled", () => {
  const result = autoSchedule({ assignments: [assignment("large", 80), assignment("small", 1, "c2", "t2")], rooms, periodsPerDay: 5 });
  noConflicts(result.placements);
  assert.ok(result.placements.some((slot) => slot.assignmentId === "small"));
  for (const input of [assignment("large", 80), assignment("small", 1, "c2", "t2")]) {
    const placed = result.placements.filter((slot) => slot.assignmentId === input.id).length;
    const missing = result.unplaced.find((item) => item.assignmentId === input.id)?.missing ?? 0;
    assert.equal(placed + missing, input.periodsPerWeek);
  }
  assert.equal(autoSchedule({ assignments: [assignment("a1", 4)], rooms: [] }).unplaced[0].missing, 4);
});

test("all subjects use the class room, even when another room is free", () => {
  const assignments = [assignment("math", 4), assignment("literature", 3, "c1", "t2")];
  const result = autoSchedule({ assignments, rooms });
  assert.equal(result.unplaced.length, 0);
  assert.ok(result.placements.every((slot) => slot.roomId === "r1"));
  noConflicts(result.placements);
});

test("an occupied fixed room is never replaced with a free room", () => {
  const fixed: AutoSlot[] = [];
  for (let dayOfWeek = 2; dayOfWeek <= 7; dayOfWeek++) for (let periodNo = 1; periodNo <= 10; periodNo++) {
    fixed.push({ assignmentId: "other", schoolClassId: "other", teacherId: "other", roomId: "r1", dayOfWeek, periodNo });
  }
  const result = autoSchedule({ assignments: [assignment("math", 4)], rooms, fixed });
  assert.equal(result.placements.length, 0);
  assert.equal(result.unplaced[0].missing, 4);
});

test("classes without a room must be assigned one before scheduling", () => {
  const result = autoSchedule({ assignments: [{ ...assignment("math", 4), roomId: null }], rooms });
  assert.equal(result.placements.length, 0);
  assert.match(result.unplaced[0].reason, /chưa được phân công phòng/);
});
