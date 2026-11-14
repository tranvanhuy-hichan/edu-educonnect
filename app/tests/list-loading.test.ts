import assert from "node:assert/strict";
import { test } from "node:test";
import { studentListSql } from "../src/server/student-list-query";
import { gradeStatsWhere } from "../src/server/grades-stats";
import { examListSelect } from "../src/modules/exams/queries";
import type { SessionUser } from "../src/lib/auth/session";

const context = { yearId: "year", termId: "term", attentionBelow: 5 };
test("student search and page parameters stay bound, including quotes and wildcard literals", () => {
  const q = "%'_ OR 1=1 --";
  const sql = studentListSql({ q, tab: "attention", classId: "class", grade: "grade", skip: 40, take: 20 }, context);
  assert.ok(!sql.page.text.includes(q));
  assert.ok(sql.page.values.includes(q.toLowerCase()));
  assert.ok(sql.page.text.includes("strpos("));
  assert.match(sql.page.text, /LIMIT \$\d+ OFFSET \$\d+/);
  assert.deepEqual(sql.page.values.slice(-2), [20, 40]);
  assert.match(sql.counts.text, /GROUP BY status$/);
  assert.ok(!sql.counts.text.includes("LIMIT"));
});
test("sort cannot interpolate SQL; supported sorts have stable tie-breakers", () => {
  const sql = (sort: string) => studentListSql({ sort, skip: 0, take: 10 }, context).page.text;
  assert.match(sql("az"), /ORDER BY "fullName" ASC, id ASC/);
  assert.match(sql("za"), /ORDER BY "fullName" DESC, id DESC/);
  assert.match(sql("new"), /ORDER BY "createdAt" DESC, "fullName" ASC, id ASC/);
  assert.equal(sql('id; DROP TABLE "Student"'), sql("az"));
});
test("grade-entry count and page share role, period and search scope", () => {
  const scope = { teacherId: "teacher-a" };
  const where = gradeStatsWhere({ where: scope, termId: "term-b", q: "10A", includePast: true, skip: 20, take: 10 });
  assert.deepEqual(where.AND, [scope, { academicTermId: "term-b" }, {}, {}, { OR: [{ schoolClass: { className: { contains: "10A", mode: "insensitive" } } }, { subject: { subjectName: { contains: "10A", mode: "insensitive" } } }] }, {}]);
  assert.ok(!("skip" in where));
});
const viewer = (roles: SessionUser["roles"], teacherId: string | null, studentId: string | null): SessionUser => ({ userId: "user", email: "test@example.invalid", roles, teacherId, studentId });
test("exam list returns only the student's seat and no teacher profiles", () => {
  const select = examListSelect(viewer(["STUDENT"], null, "student-a"));
  assert.deepEqual(select.papers.select.rooms.select.seats.where, { studentId: "student-a" });
  assert.deepEqual(select.papers.select.rooms.select.seats.select, { registrationNo: true, seatNo: true });
  assert.ok(!JSON.stringify(select).includes('"teacher":'));
});
test("staff exam cards use room counts without fetching student seats", () => {
  const select = examListSelect(viewer(["SUBJECT_TEACHER"], "teacher-a", null));
  assert.deepEqual(select.papers.select.rooms.where, { invigilators: { some: { teacherId: "teacher-a" } } });
  assert.deepEqual(select.papers.select.rooms.select.seats.where, { id: "__no_access__" });
  assert.ok(select.papers.select._count.select.rooms);
});
