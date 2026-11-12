import { testAccount } from "./helpers/account";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { listTrash, restoreTrash, trashClass, trashLessonPost, trashLibraryLesson, trashQuestion, trashStudent } from "../src/modules/trash/trash.repository";
import { restoreItem } from "../src/modules/trash/trash.service";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });
const sys = { userId: "t", email: "t-admin@test.invalid", roles: ["ADMIN" as const], teacherId: null, studentId: null };
const tag = () => `tr${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;

async function base() {
  const assignment = await prisma.classSubjectAssignment.findFirstOrThrow({ include: { schoolClass: true, academicTerm: true } });
  const teacher = await prisma.teacher.findUniqueOrThrow({ where: { id: assignment.teacherId } });
  return { assignment, teacher };
}

test("database: student trash round-trip restores the account, enrolment, views, attempts and class monitor", { skip: !enabled }, async () => {
  const { assignment } = await base();
  const t = tag();
  const user = await prisma.user.create({ data: { email: `${t}@test.invalid`, accountId: await testAccount("x"), roles: ["STUDENT"], student: { create: { fullName: `HS ${t}`, code: `HS${t}`.toUpperCase().slice(0, 14) } } }, include: { student: true } });
  const sid = user.student!.id;
  const post = await prisma.lessonPost.create({ data: { assignmentId: assignment.id, title: `P ${t}`, content: "x" } });
  const ex = await prisma.exercise.create({ data: { lessonPostId: post.id, title: "E", content: "x" } });
  await prisma.studentClassEnrollment.create({ data: { studentId: sid, schoolClassId: assignment.schoolClassId, academicYearId: assignment.schoolClass.academicYearId } });
  await prisma.lessonPostView.create({ data: { lessonPostId: post.id, studentId: sid } });
  await prisma.quizAttempt.create({ data: { exerciseId: ex.id, studentId: sid, attemptNo: 1 } });
  await prisma.schoolClass.update({ where: { id: assignment.schoolClassId }, data: { monitorStudentId: sid } });
  const originalMonitor = assignment.schoolClass.monitorStudentId;
  try {
    await trashStudent(sys.email, sid);
    assert.equal(await prisma.student.count({ where: { id: sid } }), 0);
    assert.equal(await prisma.user.count({ where: { id: user.id } }), 0);
    assert.equal(await prisma.quizAttempt.count({ where: { studentId: sid } }), 0, "bản ghi xoá lan cũng đã rời khỏi hệ thống");
    assert.equal((await prisma.schoolClass.findUniqueOrThrow({ where: { id: assignment.schoolClassId } })).monitorStudentId, null);
    const item = (await listTrash("STUDENT")).find((i) => i.label === `HS ${t}`);
    assert.ok(item);
    assert.match(item!.detail ?? "", /lớp /);

    const r = await restoreItem(sys, item!.id);
    assert.equal(r.kind, "STUDENT");
    const back = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { student: true } });
    assert.equal(back.email, user.email);
    assert.equal(back.student!.id, sid);
    assert.equal(await prisma.studentClassEnrollment.count({ where: { studentId: sid } }), 1);
    assert.equal(await prisma.lessonPostView.count({ where: { studentId: sid } }), 1);
    assert.equal(await prisma.quizAttempt.count({ where: { studentId: sid } }), 1);
    assert.equal((await prisma.schoolClass.findUniqueOrThrow({ where: { id: assignment.schoolClassId } })).monitorStudentId, sid);
    assert.equal((await listTrash("STUDENT")).some((i) => i.id === item!.id), false, "đã khôi phục thì rời thùng rác");
    await assert.rejects(restoreItem(sys, item!.id), /không còn trong thùng rác/);
  } finally {
    await prisma.schoolClass.update({ where: { id: assignment.schoolClassId }, data: { monitorStudentId: originalMonitor } });
    await prisma.quizAttempt.deleteMany({ where: { studentId: sid } });
    await prisma.lessonPostView.deleteMany({ where: { studentId: sid } });
    await prisma.studentClassEnrollment.deleteMany({ where: { studentId: sid } });
    await prisma.exercise.deleteMany({ where: { lessonPostId: post.id } });
    await prisma.lessonPost.delete({ where: { id: post.id } });
    await prisma.student.deleteMany({ where: { id: sid } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.trashItem.deleteMany({ where: { label: `HS ${t}` } });
  }
});

test("database: restore refuses cleanly on a code clash, and skips only the rows whose parent no longer exists", { skip: !enabled }, async () => {
  const t = tag();
  const code = `HS${t}`.toUpperCase().slice(0, 14);
  const mk = async (suffix: string) => prisma.user.create({ data: { email: `${t}${suffix}@test.invalid`, accountId: await testAccount("x"), roles: ["STUDENT"], student: { create: { fullName: `HS ${t}${suffix}`, code } } }, include: { student: true } });
  const a = await mk("a");
  const { assignment } = await base();
  const grade = await prisma.gradeLevel.create({ data: { gradeName: `G-${t}`, sortOrder: 97 } });
  const cls = await prisma.schoolClass.create({ data: { className: `T${t}`, gradeLevelId: grade.id, academicYearId: assignment.schoolClass.academicYearId } });
  await prisma.studentClassEnrollment.create({ data: { studentId: a.student!.id, schoolClassId: cls.id, academicYearId: cls.academicYearId } });
  let b: Awaited<ReturnType<typeof mk>> | null = null;
  try {
    await trashStudent(sys.email, a.student!.id);
    // một học sinh khác chiếm mất mã → khôi phục phải báo lỗi rõ ràng và không đổi gì
    b = await mk("b");
    const item = (await listTrash("STUDENT")).find((i) => i.label === `HS ${t}a`)!;
    await assert.rejects(restoreItem(sys, item.id), /đã được dùng/);
    assert.equal(await prisma.user.count({ where: { id: a.id } }), 0, "giao dịch bị huỷ, không để lại bản ghi dở");
    assert.equal((await listTrash("STUDENT")).some((i) => i.id === item.id), true, "vẫn còn trong thùng rác");
    // giải phóng mã rồi xoá lớp: khôi phục vẫn được, chỉ bỏ dòng xếp lớp mất lớp cha
    await prisma.student.delete({ where: { id: b.student!.id } }); await prisma.user.delete({ where: { id: b.id } }); b = null;
    await prisma.schoolClass.delete({ where: { id: cls.id } });
    const r = await restoreTrash(item.id);
    assert.equal(r.ok, true);
    assert.equal(await prisma.student.count({ where: { id: a.student!.id } }), 1);
    assert.equal(await prisma.studentClassEnrollment.count({ where: { studentId: a.student!.id } }), 0);
    assert.ok(r.ok && r.notes.some((n) => /Xếp lớp: bỏ qua 1\/1/.test(n)), JSON.stringify(r));
  } finally {
    await prisma.studentClassEnrollment.deleteMany({ where: { studentId: a.student!.id } });
    await prisma.student.deleteMany({ where: { id: { in: [a.student!.id, b?.student?.id ?? "x"] } } });
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b?.id ?? "x"] } } });
    await prisma.schoolClass.deleteMany({ where: { id: cls.id } });
    await prisma.gradeLevel.delete({ where: { id: grade.id } });
    await prisma.trashItem.deleteMany({ where: { label: { startsWith: `HS ${t}` } } });
  }
});

test("database: class, lesson post, question and library lesson each restore exactly what was removed", { skip: !enabled }, async () => {
  const { assignment, teacher } = await base();
  const t = tag();
  const grade = await prisma.gradeLevel.create({ data: { gradeName: `G-${t}`, sortOrder: 96 } });
  const subjectId = assignment.subjectId;
  const created: { cls?: string; post?: string; q?: string[]; lesson?: string; ex?: string } = {};
  const stu = await prisma.user.create({ data: { email: `${t}@test.invalid`, accountId: await testAccount("x"), roles: ["STUDENT"], student: { create: { fullName: `HS ${t}`, code: `HS${t}`.toUpperCase().slice(0, 14) } } }, include: { student: true } });
  try {
    // ── Lớp ──
    const cls = await prisma.schoolClass.create({ data: { className: `C${t}`, gradeLevelId: grade.id, academicYearId: assignment.schoolClass.academicYearId } });
    created.cls = cls.id;
    await prisma.classSubject.create({ data: { schoolClassId: cls.id, subjectId } });
    await prisma.classEmulationScore.create({ data: { schoolClassId: cls.id, academicTermId: assignment.academicTermId, periodLabel: "Tuần 1", totalScore: 90 } });
    await prisma.studentClassEnrollment.create({ data: { studentId: stu.student!.id, schoolClassId: cls.id, academicYearId: cls.academicYearId } });
    await trashClass(sys.email, cls.id);
    assert.equal(await prisma.schoolClass.count({ where: { id: cls.id } }), 0);
    assert.equal(await prisma.classSubject.count({ where: { schoolClassId: cls.id } }), 0);
    let item = (await listTrash("CLASS")).find((i) => i.label === `Lớp C${t}`)!;
    assert.match(item.detail ?? "", /1 học sinh/);
    await restoreItem(sys, item.id);
    assert.equal(await prisma.classSubject.count({ where: { schoolClassId: cls.id } }), 1);
    assert.equal(await prisma.classEmulationScore.count({ where: { schoolClassId: cls.id } }), 1);
    assert.equal(await prisma.studentClassEnrollment.count({ where: { schoolClassId: cls.id } }), 1);

    // ── Câu hỏi: xoá hẳn → khôi phục lại cả đáp án ──
    const q1 = await prisma.question.create({ data: { teacherId: teacher.id, subjectId, type: "SINGLE_CHOICE", content: `Cau ${t}`, options: { create: [{ label: "A", content: "a", isCorrect: true, order: 0 }, { label: "B", content: "b", isCorrect: false, order: 1 }] } } });
    // ── Câu hỏi: đang được bài tập dùng → lưu trữ → khôi phục bỏ lưu trữ ──
    const q2 = await prisma.question.create({ data: { teacherId: teacher.id, subjectId, type: "SHORT_ANSWER", content: `Dung ${t}` } });
    created.q = [q1.id, q2.id];
    // ── Bài học của lớp có bài tập, bài nộp, câu trả lời ──
    const post = await prisma.lessonPost.create({ data: { assignmentId: assignment.id, title: `Bai ${t}`, content: "x" } });
    created.post = post.id;
    const ex = await prisma.exercise.create({ data: { lessonPostId: post.id, title: "BT", content: "x" } });
    created.ex = ex.id;
    await prisma.exerciseQuestion.create({ data: { exerciseId: ex.id, questionId: q2.id, order: 1 } });
    const sub = await prisma.assignmentSubmission.create({ data: { exerciseId: ex.id, studentId: stu.student!.id } });
    await prisma.studentAnswer.create({ data: { submissionId: sub.id, questionId: q2.id, score: 1, maxScore: 1, isCorrect: true } });

    await trashQuestion(sys.email, q1.id);
    assert.equal(await prisma.question.count({ where: { id: q1.id } }), 0);
    await restoreItem(sys, (await listTrash("QUESTION")).find((i) => i.label.includes(`Cau ${t}`))!.id);
    assert.equal(await prisma.questionOption.count({ where: { questionId: q1.id } }), 2);

    await trashQuestion(sys.email, q2.id);
    assert.ok((await prisma.question.findUniqueOrThrow({ where: { id: q2.id } })).archivedAt, "đang được dùng nên chỉ lưu trữ");
    await restoreItem(sys, (await listTrash("QUESTION")).find((i) => i.label.includes(`Dung ${t}`))!.id);
    assert.equal((await prisma.question.findUniqueOrThrow({ where: { id: q2.id } })).archivedAt, null);

    await trashLessonPost(sys.email, post.id);
    assert.equal(await prisma.lessonPost.count({ where: { id: post.id } }), 0);
    assert.equal(await prisma.assignmentSubmission.count({ where: { exerciseId: ex.id } }), 0);
    item = (await listTrash("LESSON_POST")).find((i) => i.label === `Bai ${t}`)!;
    assert.match(item.detail ?? "", /1 bài tập, 1 bài nộp/);
    await restoreItem(sys, item.id);
    assert.equal(await prisma.exercise.count({ where: { lessonPostId: post.id } }), 1);
    assert.equal(await prisma.exerciseQuestion.count({ where: { exerciseId: ex.id } }), 1);
    assert.equal(await prisma.assignmentSubmission.count({ where: { exerciseId: ex.id } }), 1);
    assert.equal(await prisma.studentAnswer.count({ where: { submissionId: sub.id } }), 1);

    // ── Bài học trong kho ──
    const lesson = await prisma.libraryLesson.create({ data: { teacherId: teacher.id, subjectId, gradeLevelId: grade.id, title: `Kho ${t}` } });
    created.lesson = lesson.id;
    await prisma.question.update({ where: { id: q1.id }, data: { libraryLessonId: lesson.id } });
    const lex = await prisma.libraryExercise.create({ data: { lessonId: lesson.id, title: "BT mau" } });
    await prisma.libraryExerciseSource.create({ data: { exerciseId: lex.id, lessonId: lesson.id } });
    await trashLibraryLesson(sys.email, lesson.id);
    assert.ok((await prisma.libraryLesson.findUniqueOrThrow({ where: { id: lesson.id } })).archivedAt);
    assert.equal((await prisma.question.findUniqueOrThrow({ where: { id: q1.id } })).libraryLessonId, null);
    assert.equal(await prisma.libraryExerciseSource.count({ where: { lessonId: lesson.id } }), 0);
    await restoreItem(sys, (await listTrash("LIBRARY_LESSON")).find((i) => i.label === `Kho ${t}`)!.id);
    assert.equal((await prisma.libraryLesson.findUniqueOrThrow({ where: { id: lesson.id } })).archivedAt, null);
    assert.equal((await prisma.question.findUniqueOrThrow({ where: { id: q1.id } })).libraryLessonId, lesson.id);
    assert.equal((await prisma.libraryExercise.findUniqueOrThrow({ where: { id: lex.id } })).archivedAt, null);
    assert.equal(await prisma.libraryExerciseSource.count({ where: { lessonId: lesson.id } }), 1);

    // quá hạn thì không khôi phục
    await trashQuestion(sys.email, q1.id);
    const expired = (await listTrash("QUESTION")).find((i) => i.label.includes(`Cau ${t}`))!;
    await prisma.trashItem.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(restoreItem(sys, expired.id), /quá hạn|không còn/);
    // không phải ADMIN thì không dùng được
    await assert.rejects(restoreItem({ ...sys, roles: ["PRINCIPAL"] }, expired.id), /Quản trị hệ thống/);
  } finally {
    await prisma.studentAnswer.deleteMany({ where: { submission: { exerciseId: created.ex ?? "x" } } });
    await prisma.assignmentSubmission.deleteMany({ where: { exerciseId: created.ex ?? "x" } });
    await prisma.exerciseQuestion.deleteMany({ where: { exerciseId: created.ex ?? "x" } });
    await prisma.exercise.deleteMany({ where: { lessonPostId: created.post ?? "x" } });
    await prisma.lessonPost.deleteMany({ where: { id: created.post ?? "x" } });
    await prisma.libraryExerciseSource.deleteMany({ where: { lessonId: created.lesson ?? "x" } });
    await prisma.question.updateMany({ where: { libraryLessonId: created.lesson ?? "x" }, data: { libraryLessonId: null } });
    await prisma.libraryExercise.deleteMany({ where: { lessonId: created.lesson ?? "x" } });
    await prisma.libraryLesson.deleteMany({ where: { id: created.lesson ?? "x" } });
    await prisma.libraryExerciseQuestion.deleteMany({ where: { questionId: { in: created.q ?? [] } } });
    await prisma.questionOption.deleteMany({ where: { questionId: { in: created.q ?? [] } } });
    await prisma.question.deleteMany({ where: { id: { in: created.q ?? [] } } });
    await prisma.classEmulationScore.deleteMany({ where: { schoolClassId: created.cls ?? "x" } });
    await prisma.studentClassEnrollment.deleteMany({ where: { studentId: stu.student!.id } });
    await prisma.classSubject.deleteMany({ where: { schoolClassId: created.cls ?? "x" } });
    await prisma.schoolClass.deleteMany({ where: { id: created.cls ?? "x" } });
    await prisma.student.deleteMany({ where: { id: stu.student!.id } });
    await prisma.user.deleteMany({ where: { id: stu.id } });
    await prisma.gradeLevel.delete({ where: { id: grade.id } });
    await prisma.trashItem.deleteMany({ where: { OR: [{ label: { contains: t } }] } });
  }
});
