import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import type { SessionUser } from "../src/lib/auth/session";
import { loadAnnualSubjects } from "../src/modules/scoring/annual-query";
import { createYearEndResult, reviewYearResult, resolveReExam } from "../src/modules/promotion/promotion.service";
import { createScoreEntry } from "../src/modules/scoring/scoring.service";
import { moveStudent } from "../src/modules/academic/transfers";

// Chỉ chạy khi đã cấp CSDL thử nghiệm; không tự bật qua .env.
test("database: annual evaluation, approval, locked writes, scoped re-exams and transfer history", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const key = `workflow-${Date.now()}`;
  const userIds: string[] = [], subjectIds: string[] = [], classIds: string[] = [];
  let studentId = "", yearId = "", teacherId = "";
  try {
    const teacherUser = await prisma.user.create({ data: { email: `${key}-teacher@example.test`, passwordHash: "not-used", roles: ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"] } }); userIds.push(teacherUser.id);
    const teacher = await prisma.teacher.create({ data: { userId: teacherUser.id, fullName: key } }); teacherId = teacher.id;
    const studentUser = await prisma.user.create({ data: { email: `${key}-student@example.test`, passwordHash: "not-used", roles: ["STUDENT"] } }); userIds.push(studentUser.id);
    const student = await prisma.student.create({ data: { userId: studentUser.id, fullName: key } }); studentId = student.id;
    const year = await prisma.academicYear.create({ data: { yearName: key, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } }); yearId = year.id;
    const first = await prisma.academicTerm.create({ data: { academicYearId: yearId, termName: "HK1", startDate: new Date("2026-01-01"), endDate: new Date("2026-06-30"), isLocked: true } });
    const second = await prisma.academicTerm.create({ data: { academicYearId: yearId, termName: "HK2", startDate: new Date("2026-07-01"), endDate: new Date("2026-12-31") } });
    const grade = await prisma.gradeLevel.findFirstOrThrow();
    const cls = await prisma.schoolClass.create({ data: { className: `${key}-A`, academicYearId: yearId, gradeLevelId: grade.id, homeroomTeacherId: teacherId } }); classIds.push(cls.id);
    const target = await prisma.schoolClass.create({ data: { className: `${key}-B`, academicYearId: yearId, gradeLevelId: grade.id } }); classIds.push(target.id);
    await prisma.studentClassEnrollment.create({ data: { studentId, schoolClassId: cls.id, academicYearId: yearId, currentClassSince: year.startDate } });
    let firstAssignmentId = "";
    for (let index = 0; index < 8; index++) {
      const subject = await prisma.subject.create({ data: { subjectName: `${key}-${index}`, annualPeriods: 35, defaultPeriodsPerWeek: 1, assessmentType: index === 7 ? "COMMENT" : "SCORE" } }); subjectIds.push(subject.id);
      await prisma.classSubject.create({ data: { schoolClassId: cls.id, subjectId: subject.id } });
      for (const term of [first, second]) {
        const assignment = await prisma.classSubjectAssignment.create({ data: { schoolClassId: cls.id, teacherId, subjectId: subject.id, academicTermId: term.id } });
        if (index === 0 && term.id === first.id) firstAssignmentId = assignment.id;
        if (index === 7) await prisma.studentAssessment.create({ data: { studentId, assignmentId: assignment.id, outcome: term.id === first.id ? "CHUA_DAT" : "DAT", comment: "Kết quả học kỳ", updatedBy: teacherUser.email } });
        else {
          const value = term.id === first.id ? 8 : 9;
          await prisma.scoreEntry.createMany({ data: ["THUONG_XUYEN", "THUONG_XUYEN", "GIUA_KY", "CUOI_KY"].map((scoreType) => ({ studentId, assignmentId: assignment.id, academicTermId: term.id, scoreType: scoreType as "THUONG_XUYEN" | "GIUA_KY" | "CUOI_KY", value })) });
        }
      }
    }
    const manager: SessionUser = { userId: "test-manager", email: `${key}-manager@example.test`, roles: ["PRINCIPAL"], teacherId: null, studentId: null };
    const writer: SessionUser = { userId: teacherUser.id, email: teacherUser.email, roles: teacherUser.roles, teacherId, studentId: null };
    const subjects = await loadAnnualSubjects(studentId, yearId);
    assert.equal(subjects.find((subject) => subject.type === "SCORE")?.average, 8.7);
    assert.equal(subjects.find((subject) => subject.type === "COMMENT")?.outcome, "DAT");
    let result = await createYearEndResult(writer, { studentId, academicYearId: yearId, result: "O_LAI", conductRank: "Tốt", absenceDays: 0, overallAverage: 0 });
    assert.equal(result.overallAverage, 8.7); assert.equal(result.result, "LEN_LOP"); assert.equal(result.reviewStatus, "SUBMITTED");
    await assert.rejects(resolveReExam({ ...writer, teacherId: "another-teacher" }, { studentId, academicYearId: yearId, score: 10, result: "LEN_LOP" }), /không chủ nhiệm/);
    await assert.rejects(resolveReExam(writer, { studentId, academicYearId: yearId, score: 10, result: "LEN_LOP" }), /không ở trạng thái/);
    result = await reviewYearResult(manager, studentId, yearId, true, "Đã đối chiếu đầy đủ hồ sơ");
    assert.equal(result.reviewStatus, "APPROVED");
    await prisma.yearEndResult.update({ where: { id: result.id }, data: { result: "THI_LAI" } });
    await assert.rejects(resolveReExam(writer, { studentId, academicYearId: yearId, score: 10, result: "LEN_LOP" }), /đã duyệt/);
    await prisma.yearEndResult.update({ where: { id: result.id }, data: { result: "LEN_LOP" } });
    await assert.rejects(createYearEndResult(writer, { studentId, academicYearId: yearId, result: "LEN_LOP" }), /đã duyệt/);
    await assert.rejects(createScoreEntry(manager, { studentId, assignmentId: firstAssignmentId, academicTermId: first.id, scoreType: "THUONG_XUYEN", value: 10 }), /Sổ điểm đã khóa/);
    const move = { studentId, targetClassId: target.id, effectiveDate: "2026-09-01", reason: "Chuyển theo nguyện vọng", decisionReference: "QĐ-TEST" };
    await assert.rejects(moveStudent(manager, move), /đã duyệt/);
    await reviewYearResult(manager, studentId, yearId, false, "Mở lại để xử lý chuyển lớp");
    await prisma.yearEndResult.update({ where: { id: result.id }, data: { result: "THI_LAI" } });
    const reexam = await resolveReExam(writer, { studentId, academicYearId: yearId, score: 2, result: "O_LAI" });
    assert.equal(reexam.reviewStatus, "DRAFT"); assert.equal(reexam.overallAverage, 8.7);
    assert.equal(reexam.result, "THI_LAI");
    await moveStudent(manager, move);
    const history = await prisma.classTransfer.findFirstOrThrow({ where: { studentId } });
    assert.equal(history.fromClassId, cls.id); assert.equal(history.toClassId, target.id); assert.equal(history.decisionReference, "QĐ-TEST");
    assert.equal(await prisma.scoreEntry.count({ where: { studentId } }), 56);
    assert.ok(await prisma.activityLog.count({ where: { actorEmail: { startsWith: key } } }) > 0);
  } finally {
    if (studentId) {
      await prisma.classTransfer.deleteMany({ where: { studentId } });
      await prisma.yearEndResult.deleteMany({ where: { studentId } });
      await prisma.studentAssessment.deleteMany({ where: { studentId } });
      await prisma.scoreEntry.deleteMany({ where: { studentId } });
      await prisma.subjectTermAverage.deleteMany({ where: { studentId } });
      await prisma.studentClassEnrollment.deleteMany({ where: { studentId } });
      await prisma.student.delete({ where: { id: studentId } });
    }
    await prisma.activityLog.deleteMany({ where: { actorEmail: { startsWith: key } } });
    await prisma.classSubjectAssignment.deleteMany({ where: { schoolClassId: { in: classIds } } });
    await prisma.classSubject.deleteMany({ where: { schoolClassId: { in: classIds } } });
    await prisma.schoolClass.deleteMany({ where: { id: { in: classIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
    if (yearId) { await prisma.academicTerm.deleteMany({ where: { academicYearId: yearId } }); await prisma.academicYear.delete({ where: { id: yearId } }); }
    if (teacherId) await prisma.teacher.delete({ where: { id: teacherId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});
