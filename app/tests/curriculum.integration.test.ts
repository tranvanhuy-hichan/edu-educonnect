import type { Room, Teacher } from "@prisma/client";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { createClassWithSubjects, setClassSubjects, requireClassSubject } from "../src/modules/curriculum/service";
import { computeAutoSchedule, loadAutoScheduleInput } from "../src/modules/scheduling/scheduling.service";
import { prepareExamPlan, saveExamPlan } from "../src/modules/exams/service";
import type { ExamPlan } from "../src/modules/exams/schema";
import type { SessionUser } from "../src/lib/auth/session";
import type { ScheduleOptions } from "../src/modules/scheduling/options";

// All fixtures and successful writes are rolled back, including the deliberately rejected FK insert.
test("class curriculum is the shared source for assignments, timetable and exam eligibility", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const rollback = new Error("rollback curriculum fixtures");
  await assert.rejects(prisma.$transaction(async (tx) => {
    const tag = randomUUID();
    const year = await tx.academicYear.create({ data: { yearName: `curriculum-${tag}`, startDate: new Date("2099-01-01"), endDate: new Date("2099-12-31") } });
    const term = await tx.academicTerm.create({ data: { academicYearId: year.id, termName: "TEST", startDate: year.startDate, endDate: year.endDate } });
    const grade = await tx.gradeLevel.create({ data: { gradeName: `curriculum-${tag}`, sortOrder: 99 } });
    const subjects = [];
    for (const name of ["Địa", "Lý", "Toán", "Chưa dùng"]) subjects.push(await tx.subject.create({ data: { subjectName: `${name}-${tag}`, defaultPeriodsPerWeek: 2 } }));
    const rooms: Room[] = [];
    const teachers: Teacher[] = [];
    for (let i = 0; i < 2; i++) {
      rooms.push(await tx.room.create({ data: { roomName: `${tag}-${i}`, roomType: "THUONG", capacity: 40 } }));
      teachers.push(await tx.teacher.create({ data: { fullName: `Teacher ${i}`, user: { create: { email: `${tag}-t${i}@test.invalid`, passwordHash: "test-only", roles: ["SUBJECT_TEACHER"] } } } }));
    }
    const classData = (i: number) => ({ className: `A${i}`, academicYearId: year.id, gradeLevelId: grade.id, roomId: rooms[i].id });
    const a = await createClassWithSubjects(classData(0), [subjects[0].id], tx);
    const b = await createClassWithSubjects(classData(1), [subjects[1].id], tx);
    await assert.rejects(createClassWithSubjects({ ...classData(0), className: "Invalid" }, [], tx), /ít nhất một môn/);
    await assert.rejects(createClassWithSubjects({ ...classData(0), className: "Invalid" }, ["missing"], tx), /không hợp lệ/);
    assert.equal(await tx.schoolClass.count({ where: { academicYearId: year.id } }), 2);
    await requireClassSubject(tx, a.id, subjects[0].id, term.id);
    await assert.rejects(requireClassSubject(tx, a.id, subjects[1].id, term.id), /Lớp không học môn này/);
    await tx.$executeRawUnsafe("SAVEPOINT invalid_curriculum_assignment");
    await assert.rejects(tx.classSubjectAssignment.create({ data: { schoolClassId: a.id, subjectId: subjects[1].id, teacherId: teachers[0].id, academicTermId: term.id } }));
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT invalid_curriculum_assignment");
    await tx.classSubjectAssignment.create({ data: { schoolClassId: a.id, subjectId: subjects[0].id, teacherId: teachers[0].id, academicTermId: term.id } });
    for (const cls of [a, b]) {
      const student = await tx.student.create({ data: { fullName: `Học sinh ${cls.className}`, code: `${tag}-${cls.className}`, user: { create: { email: `${tag}-${cls.className}@test.invalid`, passwordHash: "test-only", roles: ["STUDENT"] } } } });
      await tx.studentClassEnrollment.create({ data: { schoolClassId: cls.id, studentId: student.id, academicYearId: year.id } });
    }
    const manager: SessionUser = { userId: "test-admin", email: "test@test.invalid", roles: ["ADMIN"], teacherId: null, studentId: null };
    const paper = (subjectId: string, startsAt = "2099-01-05T08:00"): ExamPlan["papers"][number] => ({ subjectId, startsAt, grouping: "CLASS", maxPerRoom: null, roomCount: null, excludedStudentIds: [], durationMinutes: 45, reportMinutes: 15, allocations: [] });
    const exam: ExamPlan = { title: "Curriculum exam", category: "KHAC", termId: term.id, gradeId: grade.id, notes: "test", papers: [paper(subjects[0].id), paper(subjects[1].id)] };
    const beforeTeacher = await prepareExamPlan(manager, exam, tx);
    assert.equal(beforeTeacher.papers[0].groups[0].candidates[0].classId, a.id);
    assert.equal(beforeTeacher.papers[1].groups[0].candidates[0].classId, b.id); // Class B has no teacher yet.
    const missing = await loadAutoScheduleInput(term.id, tx);
    assert.deepEqual(missing.missingAssignments.map((row) => row.className), [b.className]);
    const options: ScheduleOptions = { grades: (await tx.gradeLevel.findMany()).map((row) => ({ gradeLevelId: row.id, days: [2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, morning: 5, afternoon: 0 })) })), fixed: [] };
    await assert.rejects(computeAutoSchedule(term.id, options, tx), /Cần phân công giáo viên/);
    await tx.classSubjectAssignment.create({ data: { schoolClassId: b.id, subjectId: subjects[1].id, teacherId: teachers[1].id, academicTermId: term.id } });
    const timetable = await computeAutoSchedule(term.id, options, tx);
    assert.equal(timetable.result.unplaced.length, 0); assert.equal(timetable.result.placements.length, 4);
    await assert.rejects(setClassSubjects(tx, a.id, [subjects[2].id]), /Không thể bỏ môn đã có phân công/);
    await setClassSubjects(tx, a.id, [subjects[0].id, subjects[2].id, subjects[3].id]);
    await setClassSubjects(tx, a.id, [subjects[0].id, subjects[2].id]);
    assert.equal(await tx.classSubject.count({ where: { schoolClassId: a.id } }), 2);
    exam.papers.push(paper(subjects[2].id, "2099-01-05T10:00")); // A selected subject can have an exam before teacher assignment.
    const preview = await prepareExamPlan(manager, exam, tx);
    for (const [index, row] of preview.papers.entries()) exam.papers[index].allocations = row.groups.map((group) => ({ key: group.key, roomId: group.preferredRoomId, teacherIds: [group.candidates[0].classId === a.id ? teachers[0].id : teachers[1].id] }));
    await saveExamPlan(manager, exam, preview.fingerprint, undefined, tx); // Different classes, different subjects can share a time slot.
    await assert.rejects(setClassSubjects(tx, a.id, [subjects[0].id]), /Không thể bỏ môn đã có học sinh.*lịch thi/);
    assert.equal(await tx.classSubject.count({ where: { schoolClassId: a.id, subjectId: subjects[2].id } }), 1);
    throw rollback;
  }, { timeout: 30000 }), (error: unknown) => error === rollback);
});
after(async () => { await prisma.$disconnect(); });
