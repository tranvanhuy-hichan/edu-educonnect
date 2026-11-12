import { testAccount } from "./helpers/account";
import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import type { SessionUser } from "../src/lib/auth/session";
import { canDownloadFile, requireUploadAccess, validateFileReferences } from "../src/lib/storage/files";
import { createLessonPost, createExercise, submitAssignment, updateLessonPost, updateExercise, deleteLessonPost } from "../src/modules/content/content.service";

test("database: uploaded documents bind to assignments, staged files stay private, submissions stay personal", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const tag = `storage-${Date.now()}`;
  const userIds: string[] = [], studentIds: string[] = [], classIds: string[] = [], fileIds: string[] = [];
  let yearId = "", teacherId = "", subjectId = "", assignmentId = "", postId = "";
  try {
    const staff = await prisma.user.create({ data: { email: `${tag}-teacher@example.test`, accountId: await testAccount("test"), roles: ["SUBJECT_TEACHER"] } }); userIds.push(staff.id);
    const teacher = await prisma.teacher.create({ data: { userId: staff.id, fullName: tag } }); teacherId = teacher.id;
    const teacherSession: SessionUser = { userId: staff.id, email: staff.email, roles: staff.roles, teacherId, studentId: null };
    const year = await prisma.academicYear.create({ data: { yearName: tag, startDate: new Date("2099-01-01"), endDate: new Date("2099-12-31") } }); yearId = year.id;
    const term = await prisma.academicTerm.create({ data: { academicYearId: yearId, termName: "HK1", startDate: year.startDate, endDate: year.endDate } });
    const grade = await prisma.gradeLevel.findFirstOrThrow();
    const cls = await prisma.schoolClass.create({ data: { className: `${tag}-A`, gradeLevelId: grade.id, academicYearId: yearId } }); classIds.push(cls.id);
    const other = await prisma.schoolClass.create({ data: { className: `${tag}-B`, gradeLevelId: grade.id, academicYearId: yearId } }); classIds.push(other.id);
    const students: SessionUser[] = [];
    for (let i = 0; i < 3; i++) {
      const user = await prisma.user.create({ data: { email: `${tag}-${i}@example.test`, accountId: await testAccount("test"), roles: ["STUDENT"] } }); userIds.push(user.id);
      const student = await prisma.student.create({ data: { userId: user.id, fullName: `${tag}-${i}` } }); studentIds.push(student.id);
      await prisma.studentClassEnrollment.create({ data: { studentId: student.id, academicYearId: yearId, schoolClassId: i === 2 ? other.id : cls.id } });
      students.push({ userId: user.id, email: user.email, roles: user.roles, studentId: student.id, teacherId: null });
    }
    const subject = await prisma.subject.create({ data: { subjectName: tag, defaultPeriodsPerWeek: 2 } }); subjectId = subject.id;
    await prisma.classSubject.create({ data: { schoolClassId: cls.id, subjectId } });
    const assignment = await prisma.classSubjectAssignment.create({ data: { schoolClassId: cls.id, subjectId, teacherId, academicTermId: term.id } }); assignmentId = assignment.id;
    const file = await prisma.storedFile.create({ data: { assignmentId, uploadedBy: staff.id, purpose: "LESSON_POST", provider: "cloudinary", storageKey: `${tag}-post`, fileName: "Bài học.pdf", mimeType: "application/pdf", size: 100 } }); fileIds.push(file.id);
    assert.equal(await canDownloadFile(students[0], file), false);
    await requireUploadAccess(teacherSession, assignmentId, "LESSON_POST");
    await assert.rejects(requireUploadAccess(students[0], assignmentId, "LESSON_POST"), /Không có quyền/);
    const post = await createLessonPost(teacherSession, { assignmentId, title: "Bài học bằng tệp", content: "", attachments: [`/api/files/${file.id}`] }); postId = post.id;
    assert.equal(await canDownloadFile(students[0], file), true); assert.equal(await canDownloadFile(students[2], file), false);
    await assert.rejects(validateFileReferences(teacherSession, [`/api/files/${file.id}`], "wrong-assignment", "LESSON_POST"), /không thuộc/);
    const exercise = await createExercise(teacherSession, { lessonPostId: post.id, title: "Bài tập", content: "Trả lời bằng tệp", quizMode: false });
    await requireUploadAccess(students[0], assignmentId, "SUBMISSION", exercise.id);
    await assert.rejects(requireUploadAccess(students[2], assignmentId, "SUBMISSION", exercise.id), /không thuộc lớp/);
    const work = await prisma.storedFile.create({ data: { assignmentId, exerciseId: exercise.id, uploadedBy: students[0].userId, purpose: "SUBMISSION", provider: "minio", bucket: "private-test", storageKey: `${tag}-work`, fileName: "Bài làm.docx", mimeType: "application/octet-stream", size: 120 } }); fileIds.push(work.id);
    assert.equal(await canDownloadFile(students[0], work), true); assert.equal(await canDownloadFile(students[1], work), false); assert.equal(await canDownloadFile(teacherSession, work), true);
    await assert.rejects(validateFileReferences(students[1], [`/api/files/${work.id}`], assignmentId, "SUBMISSION", exercise.id), /không thuộc/);
    const submission = await submitAssignment(students[0], exercise.id, "", [`/api/files/${work.id}`]);
    assert.deepEqual(submission.attachments, [`/api/files/${work.id}`]);
    await prisma.assignmentSubmission.update({ where: { id: submission.id }, data: { grade: 8 } });
    await assert.rejects(requireUploadAccess(students[0], assignmentId, "SUBMISSION", exercise.id), /đã chấm/);
    await assert.rejects(submitAssignment(students[0], exercise.id, "Thay bài", []), /đã được giáo viên chấm/);
    await assert.rejects(updateLessonPost(students[0], post.id, { title: "Sai quyền", content: "x", attachments: [] }), /Không có quyền/);
    await assert.rejects(deleteLessonPost(students[0], post.id), /Không có quyền/);
    await updateLessonPost(teacherSession, post.id, { title: "Bài học cập nhật", content: "", attachments: [`/api/files/${file.id}`] });
    assert.equal((await prisma.lessonPost.findUniqueOrThrow({ where: { id: post.id } })).title, "Bài học cập nhật");
    await updateExercise(teacherSession, exercise.id, { title: "Bài tập cập nhật", content: "Nội dung", attachments: [], dueDate: null });
    await deleteLessonPost(teacherSession, post.id);
    postId = "";
    assert.equal(await prisma.assignmentSubmission.count({ where: { id: submission.id } }), 0);
    assert.equal(await prisma.exercise.count({ where: { id: exercise.id } }), 0);

  } finally {
    if (postId) { await prisma.assignmentSubmission.deleteMany({ where: { exercise: { lessonPostId: postId } } }); await prisma.exercise.deleteMany({ where: { lessonPostId: postId } }); await prisma.lessonPost.delete({ where: { id: postId } }); }
    await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } });
    if (assignmentId) await prisma.classSubjectAssignment.delete({ where: { id: assignmentId } });
    await prisma.classSubject.deleteMany({ where: { schoolClassId: { in: classIds } } });
    await prisma.studentClassEnrollment.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.schoolClass.deleteMany({ where: { id: { in: classIds } } });
    if (subjectId) await prisma.subject.delete({ where: { id: subjectId } });
    if (yearId) { await prisma.academicTerm.deleteMany({ where: { academicYearId: yearId } }); await prisma.academicYear.delete({ where: { id: yearId } }); }
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    if (teacherId) await prisma.teacher.delete({ where: { id: teacherId } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }); await prisma.$disconnect();
  }
});
