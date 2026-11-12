import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const findExercise = (id: string) =>
  prisma.exercise.findUnique({ where: { id }, include: { lessonPost: { include: { assignment: { include: { schoolClass: { select: { gradeLevelId: true } } } } } }, _count: { select: { submissions: true } } } });

export const findQuestions = (ids: string[]) => prisma.question.findMany({ where: { id: { in: ids }, archivedAt: null } });
export const maxOrder = (exerciseId: string) => prisma.exerciseQuestion.aggregate({ where: { exerciseId }, _max: { order: true } }).then((r) => r._max.order ?? 0);
export const questionIdsOf = (exerciseId: string) => prisma.exerciseQuestion.findMany({ where: { exerciseId }, select: { questionId: true } }).then((rows) => rows.map((x) => x.questionId));
export const addQuestions = (data: { exerciseId: string; questionId: string; order: number; points: number }[]) => prisma.exerciseQuestion.createMany({ data });
export const findExerciseQuestion = (id: string) => prisma.exerciseQuestion.findUnique({ where: { id } });
export const updatePoints = (id: string, points: number) => prisma.exerciseQuestion.update({ where: { id }, data: { points } });
export const removeQuestion = (id: string) => prisma.exerciseQuestion.delete({ where: { id } });
export const listExerciseQuestions = (exerciseId: string) => prisma.exerciseQuestion.findMany({ where: { exerciseId }, orderBy: { order: "asc" } });
export const reorder = (ids: string[]) => prisma.$transaction(ids.map((id, i) => prisma.exerciseQuestion.update({ where: { id }, data: { order: i + 1 } })));

/** Bài tập kèm câu hỏi (có đáp án đúng) để chấm: chỉ dùng phía máy chủ. */
export const findExerciseForGrading = (id: string) =>
  prisma.exercise.findUnique({
    where: { id },
    include: { lessonPost: { include: { assignment: true } }, questions: { orderBy: { order: "asc" }, include: { question: { include: { options: true } } } } },
  });

/** Người nhận thông báo khi bài bị nộp tự động: học sinh và giáo viên phụ trách. */
export const autoSubmitNoticeInfo = async (studentId: string, teacherId: string) => {
  const [student, teacher] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { fullName: true, userId: true } }),
    prisma.teacher.findUnique({ where: { id: teacherId }, select: { userId: true } }),
  ]);
  return { studentName: student?.fullName ?? "Học sinh", studentUserId: student?.userId ?? null, teacherUserId: teacher?.userId ?? null };
};
export const findStudentSubmission = (exerciseId: string, studentId: string) => prisma.assignmentSubmission.findUnique({ where: { exerciseId_studentId: { exerciseId, studentId } }, select: { id: true } });
export const countViolations = (exerciseId: string, studentId: string, since?: Date) => prisma.examViolation.count({ where: { exerciseId, studentId, ...(since ? { createdAt: { gte: since } } : {}) } });
export const lastViolation = (exerciseId: string, studentId: string, type: string) => prisma.examViolation.findFirst({ where: { exerciseId, studentId, type }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
export const createViolation = (data: { exerciseId: string; studentId: string; type: string; detail: string | null }) => prisma.examViolation.create({ data });
export const listViolations = (exerciseId: string) => prisma.examViolation.findMany({ where: { exerciseId }, orderBy: { createdAt: "asc" } });

export type GradedAnswer = { questionId: string; answer: unknown; score: number; maxScore: number; isCorrect: boolean };

export const countSubmittedAttempts = (exerciseId: string, studentId: string) => prisma.quizAttempt.count({ where: { exerciseId, studentId, submittedAt: { not: null } } });
export const findActiveAttempt = (exerciseId: string, studentId: string) => prisma.quizAttempt.findFirst({ where: { exerciseId, studentId, submittedAt: null }, orderBy: { attemptNo: "desc" } });
export const listAttempts = (exerciseId: string, studentId?: string) => prisma.quizAttempt.findMany({ where: { exerciseId, ...(studentId ? { studentId } : {}), submittedAt: { not: null } }, orderBy: [{ studentId: "asc" }, { attemptNo: "asc" }] });
export const createAttempt = (exerciseId: string, studentId: string, attemptNo: number, startedAt = new Date()) => prisma.quizAttempt.create({ data: { exerciseId, studentId, attemptNo, startedAt } });

/**
 * Ghi nhận một lượt làm bài đã nộp: đóng lượt (hoặc tạo lượt nếu bài không cần bấm "Bắt đầu"), rồi cập nhật kết quả đang được tính
 * (cao nhất hoặc lần cuối). Một giao dịch nên không bao giờ có kết quả nửa vời.
 */
export const recordAttempt = (d: {
  exerciseId: string; studentId: string; attemptId: string | null; attemptNo: number; scoring: string; submittedAt: Date; isLate: boolean; grade: number;
  autoSubmitted: boolean; overtime: boolean; answers: GradedAnswer[]; shouldReplace: (existingGrade: number | null) => boolean;
}) =>
  prisma.$transaction(async (tx) => {
    const attemptData = { submittedAt: d.submittedAt, grade: d.grade, isLate: d.isLate, autoSubmitted: d.autoSubmitted, overtime: d.overtime };
    if (d.attemptId) await tx.quizAttempt.update({ where: { id: d.attemptId }, data: attemptData });
    else await tx.quizAttempt.create({ data: { exerciseId: d.exerciseId, studentId: d.studentId, attemptNo: d.attemptNo, startedAt: d.submittedAt, ...attemptData } });
    const existing = await tx.assignmentSubmission.findUnique({ where: { exerciseId_studentId: { exerciseId: d.exerciseId, studentId: d.studentId } } });
    const answers = d.answers.map((a) => ({ ...a, answer: (a.answer ?? Prisma.DbNull) as Prisma.InputJsonValue }));
    const summary = { submittedAt: d.submittedAt, isLate: d.isLate, grade: d.grade, autoGraded: true, autoSubmitted: d.autoSubmitted, attemptNo: d.attemptNo };
    let submission;
    if (!existing) {
      submission = await tx.assignmentSubmission.create({ data: { exerciseId: d.exerciseId, studentId: d.studentId, ...summary, answers: { create: answers } } });
    } else if (d.shouldReplace(existing.grade)) {
      await tx.studentAnswer.deleteMany({ where: { submissionId: existing.id } });
      submission = await tx.assignmentSubmission.update({ where: { id: existing.id }, data: { ...summary, answers: { create: answers } } });
    } else {
      submission = existing; // lần này thấp hơn lần đang được tính: giữ nguyên kết quả cũ
    }
    return { submission, counted: submission.attemptNo === d.attemptNo };
  });

export const findSubmission = (id: string) => prisma.assignmentSubmission.findUnique({ where: { id }, include: { exercise: { include: { lessonPost: true } } } });
export const deleteSubmission = (id: string, exerciseId: string, studentId: string) => prisma.$transaction([prisma.studentAnswer.deleteMany({ where: { submissionId: id } }), prisma.assignmentSubmission.delete({ where: { id } }), prisma.quizAttempt.deleteMany({ where: { exerciseId, studentId } }), prisma.examViolation.deleteMany({ where: { exerciseId, studentId } })]);
export const isStudentInClass = (studentId: string, schoolClassId: string) => prisma.studentClassEnrollment.findFirst({ where: { studentId, schoolClassId }, select: { id: true } }).then((x) => x !== null);
