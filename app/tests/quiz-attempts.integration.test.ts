import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { quizAttemptState, reportViolation, startAttempt, submitQuiz } from "../src/modules/question/quiz.service";

test("database: nhiều lượt làm, cách tính điểm, giờ làm bài, lượt quá giờ, vi phạm theo từng lượt", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const u = await prisma.user.findUniqueOrThrow({ where: { email: "hocsinh2@sonha.edu.vn" }, include: { student: true } });
  const student = { userId: u.id, email: u.email, roles: ["STUDENT" as const], teacherId: null, studentId: u.student!.id };
  const ex = await prisma.exercise.findFirstOrThrow({ where: { quizMode: true, title: { contains: "Ôn tập giữa kỳ 1" }, lessonPost: { assignment: { schoolClass: { className: "10A1" } } } }, include: { questions: { include: { question: { include: { options: true } } } } } });
  // đáp án đúng của các câu một đáp án
  const correct: Record<string, unknown> = {};
  for (const q of ex.questions) { const o = q.question.options.find((x) => x.isCorrect); if (q.question.type === "SINGLE_CHOICE" && o) correct[q.questionId] = { optionId: o.id }; }
  const reset = async () => {
    await prisma.studentAnswer.deleteMany({ where: { submission: { exerciseId: ex.id, studentId: student.studentId } } });
    await prisma.assignmentSubmission.deleteMany({ where: { exerciseId: ex.id, studentId: student.studentId } });
    await prisma.quizAttempt.deleteMany({ where: { exerciseId: ex.id, studentId: student.studentId } });
    await prisma.examViolation.deleteMany({ where: { exerciseId: ex.id, studentId: student.studentId } });
  };
  const summary = () => prisma.assignmentSubmission.findUniqueOrThrow({ where: { exerciseId_studentId: { exerciseId: ex.id, studentId: student.studentId } } });
  try {
    await reset();
    // ---- 3 lượt, lấy điểm cao nhất
    await prisma.exercise.update({ where: { id: ex.id }, data: { maxAttempts: 3, attemptScoring: "BEST", timeLimitMinutes: 0, secureMode: false } });
    const a1 = await submitQuiz(student, ex.id, {});
    assert.equal(a1.attemptGrade, 0); assert.equal((await quizAttemptState(student, ex.id)).left, 2);
    const a2 = await submitQuiz(student, ex.id, correct);
    assert.ok(a2.attemptGrade > 0); assert.equal(a2.counted, true);
    assert.equal((await summary()).attemptNo, 2, "lượt 2 cao hơn nên thay thế kết quả đang tính");
    const a3 = await submitQuiz(student, ex.id, {});
    assert.equal(a3.counted, false);
    const s = await summary();
    assert.equal(s.attemptNo, 2); assert.equal(s.grade, a2.attemptGrade, "lượt 3 thấp hơn: giữ điểm cao nhất");
    await assert.rejects(submitQuiz(student, ex.id, correct), /hết lượt/);
    const st = await quizAttemptState(student, ex.id);
    assert.equal(st.used, 3); assert.equal(st.left, 0); assert.equal(st.history.length, 3);
    // ---- lấy lần cuối
    await reset();
    await prisma.exercise.update({ where: { id: ex.id }, data: { attemptScoring: "LAST" } });
    await submitQuiz(student, ex.id, correct);
    const l2 = await submitQuiz(student, ex.id, {});
    assert.equal((await summary()).grade, l2.attemptGrade); assert.equal((await summary()).attemptNo, 2);
    // ---- có giờ làm bài
    await reset();
    await prisma.exercise.update({ where: { id: ex.id }, data: { maxAttempts: 2, attemptScoring: "BEST", timeLimitMinutes: 5 } });
    await assert.rejects(submitQuiz(student, ex.id, correct), /Bắt đầu làm bài/);
    const s1 = await startAttempt(student, ex.id);
    const again = await startAttempt(student, ex.id);
    assert.equal(again.startedAt, s1.startedAt, "vào lại giữa chừng thì đồng hồ không đặt lại"); assert.equal(again.attemptNo, 1);
    const ok = await submitQuiz(student, ex.id, correct);
    assert.ok(ok.attemptGrade > 0);
    assert.equal((await prisma.quizAttempt.findFirstOrThrow({ where: { exerciseId: ex.id, studentId: student.studentId, attemptNo: 1 } })).overtime, false);
    // lượt 2 bắt đầu rồi để quá giờ: nộp muộn bị đánh dấu quá giờ
    const s2 = await startAttempt(student, ex.id);
    assert.equal(s2.attemptNo, 2);
    await prisma.quizAttempt.updateMany({ where: { exerciseId: ex.id, studentId: student.studentId, attemptNo: 2 }, data: { startedAt: new Date(Date.now() - 20 * 60_000) } });
    // lượt đã quá giờ nhiều: được đóng tự động (0 điểm), vẫn tính là đã dùng một lượt
    const after = await quizAttemptState(student, ex.id);
    assert.equal(after.used, 2); assert.equal(after.left, 0); assert.equal(after.active, null);
    const closed = await prisma.quizAttempt.findFirstOrThrow({ where: { exerciseId: ex.id, studentId: student.studentId, attemptNo: 2 } });
    assert.equal(closed.overtime, true); assert.equal(closed.grade, 0);
    assert.equal((await summary()).attemptNo, 1, "lượt quá giờ 0 điểm không thay thế điểm cao nhất");
    // ---- vi phạm tính theo từng lượt
    await reset();
    await prisma.exercise.update({ where: { id: ex.id }, data: { maxAttempts: 2, timeLimitMinutes: 0, secureMode: true, maxViolations: 2 } });
    await startAttempt(student, ex.id);
    assert.equal((await reportViolation(student, ex.id, "TAB_SWITCH")).count, 1);
    await new Promise((r) => setTimeout(r, 1700));
    const v2 = await reportViolation(student, ex.id, "TAB_SWITCH");
    assert.deepEqual(v2, { count: 2, max: 2, exceeded: true });
    await submitQuiz(student, ex.id, {}, { autoSubmitted: true });
    await new Promise((r) => setTimeout(r, 50));
    await startAttempt(student, ex.id);
    await new Promise((r) => setTimeout(r, 1700));
    assert.deepEqual(await reportViolation(student, ex.id, "WINDOW_BLUR"), { count: 1, max: 2, exceeded: false }, "lượt 2 đếm lại từ đầu");
  } finally {
    await reset();
    await prisma.notification.deleteMany({ where: { title: { contains: "tự động" } } });
    await prisma.exercise.update({ where: { id: ex.id }, data: { maxAttempts: 1, attemptScoring: "BEST", timeLimitMinutes: 0, secureMode: false, maxViolations: 3 } });
  }
});
