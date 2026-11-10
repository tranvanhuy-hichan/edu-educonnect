import assert from "node:assert/strict";
import { test } from "node:test";
import { compareCandidates, examDate, groupCandidates, reservationConflict, type Candidate, type Reservation } from "../src/modules/exams/planning";
import { parseExamPlan } from "../src/modules/exams/schema";

const candidate = (id: number, fullName = `Nguyễn Văn ${String(id).padStart(3, "0")}`, classId = "c1"): Candidate => ({ id: `s${id}`, code: `HS${id}`, fullName, classId, className: classId, classRoomId: `r-${classId}` });
const rows = Array.from({ length: 53 }, (_, index) => candidate(index + 1));
test("maximum candidates calculates room count, balances rooms and loses no candidates", () => {
  const groups = groupCandidates(rows, { grouping: "ALPHABET", maxPerRoom: 24, roomCount: 1 });
  assert.deepEqual(groups.map((group) => group.candidates.length), [18, 18, 17]);
  assert.equal(new Set(groups.flatMap((group) => group.candidates.map((candidate) => candidate.id))).size, 53);
  assert.ok(groups.every((group) => group.candidates.length <= 24));
  assert.deepEqual(groups.flatMap((group) => group.candidates.map((candidate) => candidate.id)), [...rows].sort(compareCandidates).map((candidate) => candidate.id));
});
test("explicit room count, class grouping, deterministic Vietnamese given-name ordering", () => {
  assert.deepEqual(groupCandidates(rows, { grouping: "ALPHABET", maxPerRoom: null, roomCount: 4 }).map((group) => group.candidates.length), [14, 13, 13, 13]);
  const names = [candidate(1, "Nguyễn Văn Bình"), candidate(2, "Trần Thị An"), candidate(3, "Đặng Văn Cường", "c2")];
  const alphabetical = groupCandidates(names, { grouping: "ALPHABET", maxPerRoom: 2, roomCount: null });
  assert.deepEqual(alphabetical.flatMap((group) => group.candidates.map((candidate) => candidate.id)), ["s2", "s1", "s3"]);
  const classes = groupCandidates(names, { grouping: "CLASS", maxPerRoom: null, roomCount: null });
  assert.equal(classes.length, 2); assert.equal(classes[0].preferredRoomId, "r-c1");
  assert.equal(classes[0].candidates[0].seatNo, 1);
});
test("invalid and duplicate candidate inputs are rejected", () => {
  assert.throws(() => groupCandidates([], { grouping: "CLASS", maxPerRoom: null, roomCount: null }));
  assert.throws(() => groupCandidates([rows[0], rows[0]], { grouping: "CLASS", maxPerRoom: null, roomCount: null }));
  assert.throws(() => groupCandidates(rows, { grouping: "ALPHABET", maxPerRoom: null, roomCount: 54 }));
  assert.throws(() => groupCandidates(rows, { grouping: "ALPHABET", maxPerRoom: null, roomCount: null }));
});
test("event-wide registration numbers remain stable across subjects", () => {
  const registrations = new Map(rows.map((candidate, i) => [candidate.id, `R${i + 1}`]));
  const groups = groupCandidates(rows.slice(2, 5), { grouping: "ALPHABET", maxPerRoom: 2, roomCount: null }, registrations);
  assert.deepEqual(groups.flatMap((group) => group.candidates.map((candidate) => candidate.registrationNo)), ["R3", "R4", "R5"]);
});
test("school time is UTC+7 and malformed/overflowing dates are rejected", () => {
  assert.equal(examDate("2099-01-05T08:00").toISOString(), "2099-01-05T01:00:00.000Z");
  assert.throws(() => examDate("2026-02-30T08:00")); assert.throws(() => examDate("2026-11-10T25:00")); assert.throws(() => examDate(""));
});
test("room, teacher, and student conflicts use half-open time intervals", () => {
  const a: Reservation = { label: "a", start: examDate("2099-01-05T07:45"), end: examDate("2099-01-05T08:45"), roomId: "r1", teachers: ["t1"], students: ["s1"] };
  assert.equal(reservationConflict(a, { ...a, label: "b" }), "phòng thi");
  assert.equal(reservationConflict(a, { ...a, roomId: "r2" }), "giám thị");
  assert.equal(reservationConflict(a, { ...a, roomId: "r2", teachers: ["t2"] }), "học sinh");
  assert.equal(reservationConflict(a, { ...a, start: a.end, end: examDate("2099-01-05T09:30") }), null);
});
test("malformed exam requests cannot bypass duration and subject constraints", () => {
  assert.throws(() => parseExamPlan("bad"));
  assert.throws(() => parseExamPlan(JSON.stringify({ title: "Test", category: "CUOI_KY", termId: "t", gradeId: "g", papers: [] })));
});
