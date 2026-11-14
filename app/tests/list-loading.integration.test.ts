import assert from "node:assert/strict";
import { test, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { studentListSql } from "../src/server/student-list-query";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
class Rollback extends Error {}
after(async () => prisma.$disconnect());

test("student list SQL preserves derived states, literal search, counts, filters and non-overlapping pages", { skip: !enabled }, async () => {
  try {
    await prisma.$transaction(async (tx) => {
      const prefix = `list${crypto.randomUUID().replaceAll("-", "")}`;
      const year = await tx.academicYear.create({ data: { yearName: prefix, startDate: new Date("2090-01-01"), endDate: new Date("2090-12-31") } });
      const term = await tx.academicTerm.create({ data: { academicYearId: year.id, termName: "HK1", startDate: year.startDate, endDate: year.endDate } });
      const grade = await tx.gradeLevel.create({ data: { gradeName: prefix, sortOrder: 999 } });
      const cls = await tx.schoolClass.create({ data: { className: prefix, academicYearId: year.id, gradeLevelId: grade.id } });
      const subject = await tx.subject.create({ data: { subjectName: prefix, defaultPeriodsPerWeek: 1 } });
      const account = await tx.doanUser.create({ data: { username: `${prefix}teacher`, passwordHash: "test-only", fullName: prefix, role: "EXTERNAL" } });
      const user = await tx.user.create({ data: { accountId: account.id, email: `${prefix}teacher@test.invalid`, roles: ["SUBJECT_TEACHER"] } });
      const teacher = await tx.teacher.create({ data: { userId: user.id, fullName: prefix } });
      await tx.classSubject.create({ data: { schoolClassId: cls.id, subjectId: subject.id } });
      const assignment = await tx.classSubjectAssignment.create({ data: { schoolClassId: cls.id, subjectId: subject.id, teacherId: teacher.id, academicTermId: term.id } });
      const expected = new Map<string, string>();
      for (const [i, status] of ["waiting", "locked", "attention", "learning", "learning"].entries()) {
        const account = await tx.doanUser.create({ data: { username: `${prefix}${i}`, passwordHash: "test-only", fullName: prefix, role: "EXTERNAL" } });
        const user = await tx.user.create({ data: { accountId: account.id, email: `${prefix}${i}@test.invalid`, roles: ["STUDENT"], isActive: status !== "locked" } });
        const student = await tx.student.create({ data: { userId: user.id, fullName: `${prefix}${i === 4 ? "_%'" : i}`, code: `${prefix}${i}` } });
        expected.set(student.id, status);
        if (status !== "waiting") await tx.studentClassEnrollment.create({ data: { studentId: student.id, schoolClassId: cls.id, academicYearId: year.id } });
        if (status === "attention" || i === 3) await tx.subjectTermAverage.create({ data: { studentId: student.id, assignmentId: assignment.id, academicTermId: term.id, averageValue: status === "attention" ? 4.999 : 5 } });
      }
      const context = { yearId: year.id, termId: term.id, attentionBelow: 5 };
      const read = (input: { tab?: string; q?: string; skip?: number; take?: number; grade?: string; classId?: string }) => {
        const sql = studentListSql({ q: prefix, skip: 0, take: 100, ...input }, context);
        return Promise.all([tx.$queryRaw<{ status: string; count: number }[]>(sql.counts), tx.$queryRaw<{ id: string }[]>(sql.page)]);
      };
      const [counts, all] = await read({});
      assert.deepEqual(Object.fromEntries(counts.map((r) => [r.status, r.count])), { waiting: 1, locked: 1, attention: 1, learning: 2 });
      assert.equal(all.length, 5);
      for (const status of ["waiting", "locked", "attention", "learning"]) {
        const [tabCounts, rows] = await read({ tab: status });
        assert.deepEqual(tabCounts.sort((a, b) => a.status.localeCompare(b.status)), counts.sort((a, b) => a.status.localeCompare(b.status)));
        assert.ok(rows.every((r) => expected.get(r.id) === status));
      }
      const [, first] = await read({ take: 2 }), [, second] = await read({ take: 2, skip: 2 });
      assert.equal(new Set([...first, ...second].map((r) => r.id)).size, 4);
      assert.deepEqual([...first, ...second].map((r) => r.id), all.slice(0, 4).map((r) => r.id));
      assert.equal((await read({ grade: grade.id }))[1].length, 4);
      assert.equal((await read({ classId: cls.id }))[1].length, 4);
      assert.equal((await read({ q: "_%'" }))[1].length, 1);
      assert.equal((await read({ tab: "invalid" }))[1].length, 0);
      throw new Rollback();
    }, { timeout: 90_000, maxWait: 20_000 });
  } catch (error) { if (!(error instanceof Rollback)) throw error; }
});
