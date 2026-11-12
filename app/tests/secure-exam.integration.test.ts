import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { isOverLimit, reportViolation, submitQuiz, VIOLATION_DEBOUNCE_MS } from "../src/modules/question/quiz.service";
import { publishLesson } from "../src/modules/bank/bank.service";

test("isOverLimit: max = 0 chỉ ghi nhận, không bao giờ tự nộp", () => {
  assert.equal(isOverLimit(5, 0), false);
  assert.equal(isOverLimit(2, 3), false);
  assert.equal(isOverLimit(3, 3), true);
});

test("database: thi nghiêm túc ghi nhận vi phạm, chống trùng, tự nộp, giữ cài đặt khi đăng cho lớp", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const suser = await prisma.user.findUniqueOrThrow({ where: { email: "hocsinh1@sonha.edu.vn" }, include: { student: true } });
  const student = { userId: suser.id, email: suser.email, roles: ["STUDENT" as const], teacherId: null, studentId: suser.student!.id };
  const tuser = await prisma.user.findUniqueOrThrow({ where: { email: "giaovien@sonha.edu.vn" }, include: { teacher: true } });
  const teacher = { userId: tuser.id, email: tuser.email, roles: ["SUBJECT_TEACHER" as const], teacherId: tuser.teacher!.id, studentId: null };
  const ex = await prisma.exercise.findFirstOrThrow({ where: { quizMode: true, title: { contains: "Kiểm tra 15 phút" }, lessonPost: { assignment: { schoolClass: { className: "10A1" } } } } });
  const touched: string[] = [];
  try {
    // bài thường: không nhận vi phạm
    await assert.rejects(reportViolation(student, ex.id, "TAB_SWITCH"), /không ở chế độ thi nghiêm túc/);
    await prisma.exercise.update({ where: { id: ex.id }, data: { secureMode: true, maxViolations: 3 } });
    // quyền và dữ liệu vào
    await assert.rejects(reportViolation(teacher, ex.id, "TAB_SWITCH"), /Chỉ học sinh/);
    await assert.rejects(reportViolation(student, ex.id, "HACK"), /không hợp lệ/);
    // đếm, chống trùng trong khoảng debounce, sau đó đếm tiếp
    assert.deepEqual(await reportViolation(student, ex.id, "TAB_SWITCH", "x"), { count: 1, max: 3, exceeded: false });
    assert.equal((await reportViolation(student, ex.id, "TAB_SWITCH")).count, 1, "cùng loại trong 1.5s chỉ tính một lần");
    assert.equal((await reportViolation(student, ex.id, "WINDOW_BLUR")).count, 2, "loại khác tính riêng");
    await new Promise((r) => setTimeout(r, VIOLATION_DEBOUNCE_MS + 200));
    const third = await reportViolation(student, ex.id, "TAB_SWITCH");
    assert.deepEqual(third, { count: 3, max: 3, exceeded: true });
    // tự nộp: đánh dấu autoSubmitted; sau khi nộp không ghi thêm vi phạm
    const sub = await submitQuiz(student, ex.id, {}, { autoSubmitted: true });
    touched.push(sub.id);
    assert.equal((await prisma.assignmentSubmission.findUniqueOrThrow({ where: { id: sub.id } })).autoSubmitted, true);
    assert.deepEqual(await reportViolation(student, ex.id, "MOUSE_LEAVE"), { count: 3, max: 3, exceeded: true });
    // max = 0: chỉ ghi nhận
    await prisma.studentAnswer.deleteMany({ where: { submissionId: sub.id } }); await prisma.assignmentSubmission.delete({ where: { id: sub.id } });
    await prisma.examViolation.deleteMany({ where: { exerciseId: ex.id } });
    await prisma.exercise.update({ where: { id: ex.id }, data: { maxViolations: 0 } });
    assert.equal((await reportViolation(student, ex.id, "EXIT_FULLSCREEN")).exceeded, false);

    // cài đặt thi nghiêm túc được sao chép khi đăng bài tập mẫu cho lớp
    const lib = await prisma.libraryExercise.findFirstOrThrow({ where: { title: { contains: "Bài tập - Chuyển động thẳng biến đổi đều" } } });
    const a = await prisma.classSubjectAssignment.findFirstOrThrow({ where: { teacherId: teacher.teacherId, schoolClass: { className: "10A1" }, academicTerm: { termName: "HK1" }, subject: { subjectName: "Vật lý" } } });
    const hadPost = !!(await prisma.lessonPost.findFirst({ where: { assignmentId: a.id, sourceLessonId: lib.lessonId } }));
    await prisma.libraryExercise.update({ where: { id: lib.id }, data: { secureMode: true, maxViolations: 5 } });
    try {
      await publishLesson(teacher, lib.lessonId, { assignmentIds: [a.id], items: [{ exerciseId: lib.id, dueDate: null }] });
      const copy = await prisma.exercise.findFirstOrThrow({ where: { sourceExerciseId: lib.id } });
      assert.equal(copy.secureMode, true); assert.equal(copy.maxViolations, 5);
    } finally {
      // dọn dữ liệu do bài thử tạo ra để không ảnh hưởng các test khác
      await prisma.exercise.deleteMany({ where: { sourceExerciseId: lib.id } });
      if (!hadPost) await prisma.lessonPost.deleteMany({ where: { assignmentId: a.id, sourceLessonId: lib.lessonId } });
      await prisma.libraryExercise.update({ where: { id: lib.id }, data: { secureMode: false, maxViolations: 3 } });
    }
  } finally {
    await prisma.examViolation.deleteMany({ where: { exerciseId: ex.id } });
    await prisma.exercise.update({ where: { id: ex.id }, data: { secureMode: false, maxViolations: 3 } });
  }
});
