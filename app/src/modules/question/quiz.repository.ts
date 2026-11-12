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

export const findStudentSubmission = (exerciseId: string, studentId: string) => prisma.assignmentSubmission.findUnique({ where: { exerciseId_studentId: { exerciseId, studentId } }, select: { id: true } });
export const countViolations = (exerciseId: string, studentId: string) => prisma.examViolation.count({ where: { exerciseId, studentId } });
export const lastViolation = (exerciseId: string, studentId: string, type: string) => prisma.examViolation.findFirst({ where: { exerciseId, studentId, type }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
export const createViolation = (data: { exerciseId: string; studentId: string; type: string; detail: string | null }) => prisma.examViolation.create({ data });
export const listViolations = (exerciseId: string) => prisma.examViolation.findMany({ where: { exerciseId }, orderBy: { createdAt: "asc" } });

export type GradedAnswer = { questionId: string; answer: unknown; score: number; maxScore: number; isCorrect: boolean };
export const createGradedSubmission = (data: { exerciseId: string; studentId: string; submittedAt: Date; isLate: boolean; grade: number; autoSubmitted?: boolean; answers: GradedAnswer[] }) =>
  prisma.assignmentSubmission.create({
    data: {
      exerciseId: data.exerciseId, studentId: data.studentId, submittedAt: data.submittedAt, isLate: data.isLate, grade: data.grade, autoGraded: true, autoSubmitted: data.autoSubmitted ?? false,
      answers: { create: data.answers.map((a) => ({ ...a, answer: (a.answer ?? Prisma.DbNull) as Prisma.InputJsonValue })) },
    },
  });

export const findSubmission = (id: string) => prisma.assignmentSubmission.findUnique({ where: { id }, include: { exercise: { include: { lessonPost: true } } } });
export const deleteSubmission = (id: string) => prisma.$transaction([prisma.studentAnswer.deleteMany({ where: { submissionId: id } }), prisma.assignmentSubmission.delete({ where: { id } })]);
export const isStudentInClass = (studentId: string, schoolClassId: string) => prisma.studentClassEnrollment.findFirst({ where: { studentId, schoolClassId }, select: { id: true } }).then((x) => x !== null);
