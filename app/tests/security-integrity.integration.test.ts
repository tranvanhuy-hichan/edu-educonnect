import { testAccount, setPasswordHashOf } from "./helpers/account";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { recordAttempt, listAttempts } from "../src/modules/question/quiz.repository";
import { resetQuizSubmission, startAttempt, submitQuiz, reportViolation, quizAttemptState } from "../src/modules/question/quiz.service";
import { consumeLoginAttempt } from "../src/modules/auth/login-throttle.repository";
import { login, resolveSessionIdentity } from "../src/modules/auth/auth.service";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });
test("database: concurrent close cannot overwrite; retake and forced submission retain evidence", { skip: !enabled }, async () => {
  const su = await prisma.user.findUniqueOrThrow({ where: { email: "hocsinh2@sonha.edu.vn" }, include: { student: true } });
  const source = await prisma.exercise.findFirstOrThrow({ where: { quizMode: true, questions: { some: {} }, lessonPost: { assignment: { schoolClass: { enrollments: { some: { studentId: su.student!.id } } } } } }, include: { questions: true, lessonPost: { include: { assignment: { include: { teacher: true } } } } } });
  const student = { userId: su.id, email: su.email, roles: ["STUDENT" as const], studentId: su.student!.id, teacherId: null };
  const teacher = { userId: source.lessonPost.assignment.teacher.userId, email: "teacher@test.invalid", roles: ["SUBJECT_TEACHER" as const], studentId: null, teacherId: source.lessonPost.assignment.teacherId };
  const post = await prisma.lessonPost.create({ data: { assignmentId: source.lessonPost.assignmentId, title: "security fixture", content: "test" } });
  const ex = await prisma.exercise.create({ data: { lessonPostId: post.id, title: "security fixture", content: "test", quizMode: true, secureMode: true, maxViolations: 1, maxAttempts: 1, questions: { create: { questionId: source.questions[0].questionId, points: 1, order: 1 } } } });
  try {
    await assert.rejects(submitQuiz(student, ex.id, {}), /Bắt đầu/);
    await startAttempt(student, ex.id);
    const active = await prisma.quizAttempt.findFirstOrThrow({ where: { exerciseId: ex.id } });
    const data = { exerciseId: ex.id, studentId: student.studentId, attemptId: active.id, attemptNo: 1, scoring: "LAST", submittedAt: new Date(), isLate: false, autoSubmitted: false, overtime: false, answers: [], snapshot: { fixture: true }, shouldReplace: () => true };
    const outcomes = await Promise.allSettled([recordAttempt({ ...data, grade: 3 }), recordAttempt({ ...data, grade: 9 })]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: active.id } });
    const summary = await prisma.assignmentSubmission.findUniqueOrThrow({ where: { exerciseId_studentId: { exerciseId: ex.id, studentId: student.studentId } } });
    assert.equal(summary.grade, attempt.grade);
    await resetQuizSubmission(teacher, summary.id);
    assert.equal((await quizAttemptState(student, ex.id)).left, 1);
    assert.deepEqual((await prisma.quizAttempt.findUniqueOrThrow({ where: { id: active.id } })).snapshot, { fixture: true });
    await startAttempt(student, ex.id);
    assert.equal((await reportViolation(student, ex.id, "TAB_SWITCH")).exceeded, true);
    const closed = await prisma.quizAttempt.findFirstOrThrow({ where: { exerciseId: ex.id, attemptNo: 2 } });
    assert.equal(closed.autoSubmitted, true); assert.ok(closed.snapshot);
    assert.equal(await prisma.examViolation.count({ where: { exerciseId: ex.id } }), 1);
    await assert.rejects(submitQuiz(student, ex.id, {}));
    const history = await listAttempts(ex.id, student.studentId);
    assert.equal(history.length, 2); assert.equal("snapshot" in history[0], false);
  } finally {
    await prisma.notification.deleteMany({ where: { link: { contains: ex.id } } });
    await prisma.studentAnswer.deleteMany({ where: { submission: { exerciseId: ex.id } } });
    await prisma.assignmentSubmission.deleteMany({ where: { exerciseId: ex.id } });
    await prisma.exercise.delete({ where: { id: ex.id } });
    await prisma.lessonPost.delete({ where: { id: post.id } });
  }
});
test("database: shared limiter, current roles and revocation on password reset", { skip: !enabled }, async () => {
  process.env.JWT_SECRET = "security-integration-secret";
  const key = `fixture-${Date.now()}@test.invalid`;
  const results = await Promise.all(Array.from({ length: 12 }, () => consumeLoginAttempt("test", key)));
  assert.equal(results.filter(Boolean).length, 10);
  const bcrypt = await import("bcryptjs");
  const u = await prisma.user.create({ data: { email: key, accountId: await testAccount(await bcrypt.hash("test-pass", 4)), roles: ["STUDENT"] } });
  try {
    const session = await login({ email: key, password: "test-pass" });
    await prisma.user.update({ where: { id: u.id }, data: { roles: ["LIBRARIAN"] } });
    assert.deepEqual((await resolveSessionIdentity(u.id, session.credentialTag))?.roles, ["LIBRARIAN"]);
    await setPasswordHashOf(u.id, await bcrypt.hash("changed", 4));
    assert.equal(await resolveSessionIdentity(u.id, session.credentialTag), null);
    assert.equal(await resolveSessionIdentity(u.id), null);
  } finally { await prisma.user.delete({ where: { id: u.id } }); }
});
