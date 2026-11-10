import assert from "node:assert/strict";
import { test } from "node:test";
import { draftExamIssues, draftReservations } from "../src/modules/exams/draft-validation";
import type { ExamPreview } from "../src/modules/exams/service";
import type { ExamPlan } from "../src/modules/exams/schema";
const preview: ExamPreview = { fingerprint: "test", gradeName: "11", termName: "HK1", papers: [{ subjectId: "math", subjectName: "Toán", grouping: "ALPHABET", candidateCount: 2, groups: [1, 2].map((i) => ({ key: `g${i}`, label: `Nhóm ${i}`, preferredRoomId: null, candidates: [{ id: `s${i}`, code: `HS${i}`, fullName: `Tên ${i}`, classId: "c", className: "11A1", classRoomId: null, registrationNo: String(i), seatNo: 1 }] })) }] };
const plan: ExamPlan = { title: "Test", category: "KHAC", termId: "term", gradeId: "grade", notes: "", papers: [{ subjectId: "math", grouping: "ALPHABET", maxPerRoom: 1, roomCount: null, startsAt: "2099-01-05T08:00", durationMinutes: 90, reportMinutes: 15, excludedStudentIds: [], allocations: [1, 2].map((i) => ({ key: `g${i}`, roomId: `r${i}`, teacherIds: [`t${i}`] })) }] };
const rooms = [1, 2].map((i) => ({ id: `r${i}`, label: `P${i}`, capacity: 40 }));
test("local UI validation detects room/proctor conflicts before save", () => {
  assert.deepEqual(draftExamIssues(plan, preview, rooms), []);
  const sameRoom = structuredClone(plan); sameRoom.papers[0].allocations[1].roomId = "r1";
  assert.ok(draftExamIssues(sameRoom, preview, rooms).some((issue) => issue.includes("Trùng phòng thi")));
  const sameTeacher = structuredClone(plan); sameTeacher.papers[0].allocations[1].teacherIds = ["t1"];
  assert.ok(draftExamIssues(sameTeacher, preview, rooms).some((issue) => issue.includes("Trùng giám thị")));
});
test("local UI validation includes report time, missing inputs, and capacity", () => {
  assert.equal(draftReservations(plan, preview)[0].start.toISOString(), "2099-01-05T00:45:00.000Z");
  const incomplete = structuredClone(plan); incomplete.papers[0].startsAt = ""; incomplete.papers[0].allocations = [];
  assert.ok(draftExamIssues(incomplete, preview, rooms).length >= 5);
  assert.ok(draftExamIssues(plan, preview, [{ ...rooms[0], capacity: 0 }, rooms[1]]).some((issue) => issue.includes("không đủ sức chứa")));
});
