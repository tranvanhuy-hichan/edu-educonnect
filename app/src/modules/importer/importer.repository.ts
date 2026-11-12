import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NormalizedQuestion } from "./normalize";

export const hasSubject = (teacherId: string, subjectId: string) => prisma.teacherSubject.findUnique({ where: { teacherId_subjectId: { teacherId, subjectId } } }).then((x) => x !== null);
export const findSubject = (id: string) => prisma.subject.findUnique({ where: { id } });
export const findGrade = (id: string) => prisma.gradeLevel.findUnique({ where: { id } });
export const findLesson = (id: string) => prisma.libraryLesson.findUnique({ where: { id } });
export const countJobsSince = (teacherId: string, since: Date) => prisma.importJob.count({ where: { teacherId, createdAt: { gte: since } } });

export const createJob = (data: Prisma.ImportJobUncheckedCreateInput) => prisma.importJob.create({ data });
export const updateJob = (id: string, data: Prisma.ImportJobUncheckedUpdateInput) => prisma.importJob.update({ where: { id }, data });
export const findJob = (id: string) => prisma.importJob.findUnique({ where: { id }, include: { subject: true, gradeLevel: true, libraryLesson: true } });
export const listJobs = (teacherId: string, take = 50) =>
  prisma.importJob.findMany({ where: { teacherId }, orderBy: { createdAt: "desc" }, take, include: { subject: true, gradeLevel: true, libraryLesson: { select: { title: true } } } });

export const jobQuestions = (jobId: string) =>
  prisma.question.findMany({ where: { importJobId: jobId, archivedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { options: { orderBy: { order: "asc" } } } });

/** Duyệt (READY) các câu của phiên nhập; `questionId` để duyệt riêng một câu. Chỉ tác động câu của chính giáo viên. */
export const approveQuestions = (teacherId: string, jobId: string, questionId?: string) =>
  prisma.question.updateMany({
    where: { teacherId, importJobId: jobId, reviewStatus: "NEEDS_REVIEW", ...(questionId && { id: questionId }) },
    data: { reviewStatus: "READY", reviewNote: null },
  });

export const maxLessonOrder = (teacherId: string, subjectId: string, gradeLevelId: string) =>
  prisma.libraryLesson.aggregate({ where: { teacherId, subjectId, gradeLevelId, archivedAt: null }, _max: { orderNo: true } }).then((r) => r._max.orderNo ?? 0);

const labelOf = (type: string, i: number) => (type === "TRUE_FALSE_GROUP" ? "abcdef" : "ABCDEF")[i] ?? String(i + 1);

export type ResolvedQuestion = NormalizedQuestion & { imageUrls: string[]; optionImageUrls: string[][] };
export type SaveResult = { questionIds: string[]; flagged: number; libraryExerciseId: string | null; libraryLessonId: string | null };

/** Lưu toàn bộ kết quả của một phiên trong một giao dịch: câu hỏi (+ bài học và bài tập mẫu nếu là đề kiểm tra) và cập nhật phiên. */
export function saveImportResult(p: {
  jobId: string; teacherId: string; subjectId: string; gradeLevelId: string; libraryLessonId: string | null; kind: "QUESTIONS" | "TEST";
  testTitle: string; fileName: string; questions: ResolvedQuestion[]; warnings: string[];
}): Promise<SaveResult> {
  return prisma.$transaction(async (tx) => {
    let lessonId = p.libraryLessonId;
    let exerciseId: string | null = null;
    if (p.kind === "TEST" && !lessonId) {
      const max = await tx.libraryLesson.aggregate({ where: { teacherId: p.teacherId, subjectId: p.subjectId, gradeLevelId: p.gradeLevelId, archivedAt: null }, _max: { orderNo: true } });
      const lesson = await tx.libraryLesson.create({ data: { teacherId: p.teacherId, subjectId: p.subjectId, gradeLevelId: p.gradeLevelId, title: (p.testTitle || p.fileName.replace(/\.[^.]+$/, "")).slice(0, 200), orderNo: (max._max.orderNo ?? 0) + 1 } });
      lessonId = lesson.id;
    }
    const ids: string[] = [];
    for (const q of p.questions) {
      const created = await tx.question.create({
        data: {
          teacherId: p.teacherId, subjectId: p.subjectId, gradeLevelId: p.gradeLevelId, libraryLessonId: lessonId, importJobId: p.jobId,
          type: q.type, content: q.content, images: q.imageUrls, topic: q.topic, difficulty: q.difficulty, explanation: q.explanation,
          answerKey: q.type === "SHORT_ANSWER" && q.answerKey ? q.answerKey : undefined,
          reviewStatus: q.reviewStatus, reviewNote: q.reviewNote,
          options: { create: q.options.map((o, i) => ({ label: labelOf(q.type, i), content: o.content, images: q.optionImageUrls[i] ?? [], isCorrect: o.isCorrect, order: i })) },
        },
      });
      ids.push(created.id);
    }
    if (p.kind === "TEST" && lessonId && ids.length) {
      const ex = await tx.libraryExercise.create({
        data: {
          lessonId, title: (p.testTitle || p.fileName.replace(/\.[^.]+$/, "")).slice(0, 200), kind: "NORMAL", quizMode: true,
          questions: { create: ids.map((questionId, i) => ({ questionId, order: i + 1, points: p.questions[i].points })) },
        },
      });
      exerciseId = ex.id;
    }
    const flagged = p.questions.filter((q) => q.reviewStatus === "NEEDS_REVIEW").length;
    await tx.importJob.update({
      where: { id: p.jobId },
      data: { status: "DONE", questionCount: ids.length, flaggedCount: flagged, warnings: p.warnings, libraryExerciseId: exerciseId, libraryLessonId: lessonId, finishedAt: new Date(), error: null },
    });
    return { questionIds: ids, flagged, libraryExerciseId: exerciseId, libraryLessonId: lessonId };
  }, { timeout: 120_000, maxWait: 15_000 });
}
