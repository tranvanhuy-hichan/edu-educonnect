import { loadScheduleSlots } from "../src/modules/scheduling/schedule-slots";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { addDays, mondayOf, parseDate } from "../src/lib/format";
import { effectiveSlots, isVersionEffective } from "../src/modules/scheduling/effective";
import { insertVersion, lockTimetableTerm, parseStartingWeek } from "../src/modules/scheduling/versions";

const start = mondayOf(parseDate("2099-01-07"));

test("effective weeks use Monday boundaries, including Sunday and year transitions", () => {
  const version = { startsOn: start, endsOn: addDays(start, 14) };
  assert.equal(isVersionEffective(version, addDays(start, -1)), false);
  assert.equal(isVersionEffective(version, start), true);
  assert.equal(isVersionEffective(version, addDays(start, 13)), true);
  assert.equal(isVersionEffective(version, addDays(start, 14)), false);
  assert.equal(isVersionEffective({ ...version, endsOn: null }, addDays(start, 100)), true);
  assert.equal(parseStartingWeek("2027-01-03").toISOString().slice(0, 10), "2026-12-28");
  assert.throws(() => parseStartingWeek("2026-02-31"));
  assert.throws(() => parseStartingWeek(""));
});

test("database: version insertion, history, exact boundary and diary preservation", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const rollback = new Error("rollback test fixtures");
  await assert.rejects(prisma.$transaction(async (tx) => {
    const tag = randomUUID();
    const year = await tx.academicYear.create({ data: { yearName: `test-${tag}`, startDate: start, endDate: addDays(start, 100) } });
    const term = await tx.academicTerm.create({ data: { academicYearId: year.id, termName: "TEST", startDate: start, endDate: addDays(start, 90) } });
    const grade = await tx.gradeLevel.create({ data: { gradeName: `test-${tag}`, sortOrder: 99 } });
    const cls = await tx.schoolClass.create({ data: { className: "TEST", academicYearId: year.id, gradeLevelId: grade.id } });
    const user = await tx.user.create({ data: { email: `${tag}@test.invalid`, roles: ["SUBJECT_TEACHER"], passwordHash: "test-only", teacher: { create: { fullName: "Test teacher" } } }, include: { teacher: true } });
    const subject = await tx.subject.create({ data: { subjectName: `test-${tag}`, defaultPeriodsPerWeek: 1 } });
    await tx.classSubject.create({ data: { schoolClassId: cls.id, subjectId: subject.id } });
    const assignment = await tx.classSubjectAssignment.create({ data: { schoolClassId: cls.id, subjectId: subject.id, teacherId: user.teacher!.id, academicTermId: term.id } });
    const room = await tx.room.create({ data: { roomName: `test-${tag}`, roomType: "THUONG", capacity: 40 } });
    await lockTimetableTerm(tx, term.id);
    const first = (await insertVersion(tx, term.id, start)).version;
    const last = (await insertVersion(tx, term.id, addDays(start, 28))).version;
    const middle = (await insertVersion(tx, term.id, addDays(start, 14))).version;
    const versions = await tx.timetableVersion.findMany({ where: { academicTermId: term.id }, orderBy: { startsOn: "asc" } });
    assert.deepEqual(versions.map((v) => v.endsOn?.toISOString() ?? null), [addDays(start, 14).toISOString(), addDays(start, 28).toISOString(), null]);
    await assert.rejects(insertVersion(tx, term.id, addDays(start, 14)), /đã có một thời khóa biểu/);
    await assert.rejects(insertVersion(tx, term.id, addDays(start, -7)), /nằm trong học kỳ/);
    const makeSlot = (versionId: string, periodNo: number) => tx.timetableSlot.create({ data: { versionId, schoolClassId: cls.id, assignmentId: assignment.id, roomId: room.id, academicTermId: term.id, dayOfWeek: 2, periodNo } });
    const firstSlot = await makeSlot(first.id, 1);
    const middleSlot = await makeSlot(middle.id, 2);
    const lastSlot = await makeSlot(last.id, 1); // Same room/time as old version is allowed.
    for (const [day, expected] of [[-1, null], [0, firstSlot.id], [13, firstSlot.id], [14, middleSlot.id], [27, middleSlot.id], [28, lastSlot.id]] as const) {
      const slots = await tx.timetableSlot.findMany({ where: { academicTermId: term.id, ...effectiveSlots(addDays(start, day)) } });
      assert.deepEqual(slots.map((s) => s.id), expected ? [expected] : []);
    }
    await tx.timetableActivity.create({ data: { versionId: first.id, schoolClassId: cls.id, name: "Chào cờ", dayOfWeek: 2, periodNo: 3 } });
    await tx.timetableVersion.update({ where: { id: first.id }, data: { settings: { grades: [], fixed: [{ name: "Chào cờ" }] } } });
    const calendar = await loadScheduleSlots({ academicTermId: term.id, ...effectiveSlots(start) }, tx);
    assert.equal(calendar.length, 2);
    assert.equal(calendar.find((slot) => slot.kind === "activity")?.assignment.subject.subjectName, "Chào cờ");
    assert.equal((await loadScheduleSlots({ academicTermId: term.id, ...effectiveSlots(addDays(start, 14)) }, tx)).length, 1);
    const log = await tx.classPeriodLog.create({ data: { timetableSlotId: firstSlot.id, schoolClassId: cls.id, logDate: addDays(start, 7) } });
    await assert.rejects(insertVersion(tx, term.id, addDays(start, 7)), /đã có sổ đầu bài/);
    assert.ok(await tx.classPeriodLog.findUnique({ where: { id: log.id } }));
    assert.equal(await tx.timetableSlot.count({ where: { academicTermId: term.id } }), 3);
    throw rollback;
  }, { timeout: 20000 }), (error: unknown) => error === rollback);
});

after(async () => { await prisma.$disconnect(); });
