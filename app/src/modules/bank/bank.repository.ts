import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { trashLibraryLesson } from "@/modules/trash/trash.repository";

/* ---------- Bài học mẫu ---------- */
const lessonCounts = { _count: { select: { questions: { where: { archivedAt: null } }, exercises: { where: { archivedAt: null } } } } } as const;

/** `teacherId` bỏ trống = tất cả giáo viên (quản lý xem). */
export const listLessons = (teacherId: string | undefined, subjectId: string, gradeLevelId: string, page?: { q?: string; skip: number; take: number }) =>
  prisma.libraryLesson.findMany({ where: { ...(teacherId ? { teacherId } : {}), subjectId, gradeLevelId, archivedAt: null, ...(page?.q ? { title: { contains: page.q, mode: "insensitive" } } : {}) }, skip: page?.skip, take: page?.take, orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, title: true, orderNo: true, teacherId: true, subjectId: true, gradeLevelId: true, ...lessonCounts, teacher: { select: { fullName: true } } } });
export const lessonCountsByGrade = (teacherId?: string) =>
  prisma.libraryLesson.groupBy({ by: ["subjectId", "gradeLevelId"], where: { ...(teacherId ? { teacherId } : {}), archivedAt: null }, _count: { _all: true } });
export const lessonsForPicker = (teacherId: string) =>
  prisma.libraryLesson.findMany({ where: { teacherId, archivedAt: null }, orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, orderNo: true, subjectId: true, gradeLevelId: true } });
export const findLesson = (id: string) =>
  prisma.libraryLesson.findUnique({ where: { id }, include: { teacher: { select: { fullName: true } }, subject: { select: { subjectName: true } }, gradeLevel: { select: { gradeName: true } }, ...lessonCounts } });
export const maxLessonOrder = (teacherId: string, subjectId: string, gradeLevelId: string) =>
  prisma.libraryLesson.aggregate({ where: { teacherId, subjectId, gradeLevelId, archivedAt: null }, _max: { orderNo: true } }).then((r) => r._max.orderNo ?? 0);
export const createLesson = (data: Prisma.LibraryLessonUncheckedCreateInput) => prisma.libraryLesson.create({ data });
export const updateLesson = (id: string, data: Prisma.LibraryLessonUncheckedUpdateInput) => prisma.libraryLesson.update({ where: { id }, data });
/** Xóa bài học = lưu trữ: câu hỏi về "chưa phân bài", bài tập mẫu của bài cũng được lưu trữ. */
export const archiveLesson = (id: string, actorEmail: string) => trashLibraryLesson(actorEmail, id); // lưu trữ và chụp vào thùng rác

/* ---------- Bài tập mẫu ---------- */
export const listExercises = (lessonId: string) =>
  prisma.libraryExercise.findMany({ where: { lessonId, archivedAt: null }, orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }], include: { _count: { select: { questions: true } }, sources: { include: { lesson: { select: { id: true, title: true } } } } } });
export const findExercise = (id: string) =>
  prisma.libraryExercise.findUnique({
    where: { id },
    include: {
      lesson: true,
      sources: { include: { lesson: { select: { id: true, title: true, orderNo: true } } } },
      questions: { orderBy: { order: "asc" }, include: { question: { include: { options: { orderBy: { order: "asc" } }, libraryLesson: { select: { id: true, title: true } } } } } },
    },
  });
export const maxExerciseOrder = (lessonId: string) => prisma.libraryExercise.aggregate({ where: { lessonId }, _max: { orderNo: true } }).then((r) => r._max.orderNo ?? 0);
export const createExercise = (data: Prisma.LibraryExerciseUncheckedCreateInput, sourceLessonIds: string[]) =>
  prisma.libraryExercise.create({ data: { ...data, sources: { create: sourceLessonIds.map((lessonId) => ({ lessonId })) } } });
export const updateExercise = (id: string, data: Prisma.LibraryExerciseUncheckedUpdateInput, sourceLessonIds: string[] | null) =>
  prisma.$transaction(async (tx) => {
    if (sourceLessonIds) {
      await tx.libraryExerciseSource.deleteMany({ where: { exerciseId: id } });
      await tx.libraryExerciseSource.createMany({ data: sourceLessonIds.map((lessonId) => ({ exerciseId: id, lessonId })) });
    }
    return tx.libraryExercise.update({ where: { id }, data });
  });
export const archiveExercise = (id: string) => prisma.libraryExercise.update({ where: { id }, data: { archivedAt: new Date() } });

/* ---------- Câu hỏi trong bài tập mẫu ---------- */
export const findQuestions = (ids: string[]) => prisma.question.findMany({ where: { id: { in: ids } } });
export const pool = (teacherId: string, subjectId: string, gradeLevelId: string, lessonIds: (string | null)[], excludeIds: string[]) =>
  prisma.question.findMany({
    where: { teacherId, subjectId, gradeLevelId, archivedAt: null, parentId: null, reviewStatus: "READY", libraryLessonId: { in: lessonIds as string[] }, id: { notIn: excludeIds } },
    orderBy: { createdAt: "desc" },
    include: { libraryLesson: { select: { id: true, title: true } } },
    take: 500,
  });
export const maxQuestionOrder = (exerciseId: string) => prisma.libraryExerciseQuestion.aggregate({ where: { exerciseId }, _max: { order: true } }).then((r) => r._max.order ?? 0);
export const questionIdsOf = (exerciseId: string) => prisma.libraryExerciseQuestion.findMany({ where: { exerciseId }, select: { questionId: true } }).then((r) => r.map((x) => x.questionId));
export const addQuestions = (rows: { exerciseId: string; questionId: string; order: number; points: number }[]) => prisma.libraryExerciseQuestion.createMany({ data: rows });
export const findLink = (id: string) => prisma.libraryExerciseQuestion.findUnique({ where: { id }, include: { exercise: { include: { lesson: true } } } });
export const updatePoints = (id: string, points: number) => prisma.libraryExerciseQuestion.update({ where: { id }, data: { points } });
export const removeLink = (id: string) => prisma.libraryExerciseQuestion.delete({ where: { id } });
export const clearLinks = (exerciseId: string) => prisma.libraryExerciseQuestion.deleteMany({ where: { exerciseId } });
export const listLinks = (exerciseId: string) => prisma.libraryExerciseQuestion.findMany({ where: { exerciseId }, orderBy: { order: "asc" } });
export const reorder = (ids: string[]) => prisma.$transaction(ids.map((id, i) => prisma.libraryExerciseQuestion.update({ where: { id }, data: { order: i + 1 } })));

/* ---------- Đăng cho lớp ---------- */
export const eligibleAssignments = (teacherId: string | null, subjectId: string, gradeLevelId: string) =>
  prisma.classSubjectAssignment.findMany({
    where: { ...(teacherId ? { teacherId } : {}), subjectId, schoolClass: { gradeLevelId } },
    orderBy: [{ schoolClass: { className: "asc" } }, { academicTerm: { startDate: "desc" } }],
    include: { schoolClass: { select: { className: true, gradeLevelId: true } }, academicTerm: { select: { termName: true, academicYear: { select: { yearName: true } } } } },
  });
export const findAssignments = (ids: string[]) =>
  prisma.classSubjectAssignment.findMany({ where: { id: { in: ids } }, include: { schoolClass: { select: { className: true, gradeLevelId: true } } } });
export const findPostBySource = (assignmentId: string, sourceLessonId: string) => prisma.lessonPost.findFirst({ where: { assignmentId, sourceLessonId } });
export const createPost = (data: { assignmentId: string; title: string; content: string; attachments: string[]; sourceLessonId: string | null }) => prisma.lessonPost.create({ data });
export const publishedExerciseSources = (lessonPostId: string) => prisma.exercise.findMany({ where: { lessonPostId, sourceExerciseId: { not: null } }, select: { sourceExerciseId: true } }).then((r) => r.map((x) => x.sourceExerciseId!));
export const findPostForPublish = (id: string) => prisma.lessonPost.findUnique({ where: { id }, include: { assignment: { include: { schoolClass: { select: { gradeLevelId: true } } } } } });
export const exercisesWithQuestions = (ids: string[]) =>
  prisma.libraryExercise.findMany({ where: { id: { in: ids }, archivedAt: null }, include: { questions: { orderBy: { order: "asc" }, include: { question: { select: { id: true, reviewStatus: true, archivedAt: true } } } } } });
export const createExerciseCopy = (data: { lessonPostId: string; title: string; content: string; attachments: unknown; quizMode: boolean; showAnswers: string; secureMode: boolean; maxViolations: number; shuffleQuestions: boolean; shuffleOptions: boolean; maxAttempts: number; attemptScoring: string; timeLimitMinutes: number; allowReview: boolean; dueDate: Date | null; sourceExerciseId: string; questions: { questionId: string; order: number; points: number }[] }) =>
  prisma.exercise.create({
    data: {
      lessonPostId: data.lessonPostId, title: data.title, content: data.content, attachments: (data.attachments ?? []) as Prisma.InputJsonValue, quizMode: data.quizMode,
      showAnswers: data.showAnswers, secureMode: data.secureMode, maxViolations: data.maxViolations, shuffleQuestions: data.shuffleQuestions, shuffleOptions: data.shuffleOptions, maxAttempts: data.maxAttempts, attemptScoring: data.attemptScoring, timeLimitMinutes: data.timeLimitMinutes, allowReview: data.allowReview, dueDate: data.dueDate, sourceExerciseId: data.sourceExerciseId,
      questions: { create: data.questions },
    },
  });
export const libraryExercisesFor = (teacherId: string, subjectId: string, gradeLevelId: string) =>
  prisma.libraryExercise.findMany({
    where: { archivedAt: null, lesson: { teacherId, subjectId, gradeLevelId, archivedAt: null } },
    orderBy: [{ lesson: { orderNo: "asc" } }, { orderNo: "asc" }],
    include: { lesson: { select: { title: true, orderNo: true } }, _count: { select: { questions: true } } },
  });
export const notificationRecipients = (assignmentId: string) =>
  prisma.classSubjectAssignment.findUnique({ where: { id: assignmentId }, include: { subject: true, schoolClass: { include: { enrollments: { include: { student: { select: { userId: true } } } } } } } });

export const assignQuestions = (teacherId: string, ids: string[], libraryLessonId: string) =>
  prisma.question.updateMany({ where: { teacherId, id: { in: ids }, archivedAt: null }, data: { libraryLessonId } });
