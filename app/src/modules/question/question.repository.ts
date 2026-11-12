import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { QuestionInput } from "./question.schema";

export type QuestionFilter = { teacherId?: string; subjectId?: string; gradeLevelId?: string; lessonId?: string; difficulty?: string; type?: string; q?: string; topic?: string; reviewStatus?: string };

function where(f: QuestionFilter): Prisma.QuestionWhereInput {
  return {
    archivedAt: null,
    parentId: null,
    ...(f.teacherId && { teacherId: f.teacherId }),
    ...(f.subjectId && { subjectId: f.subjectId }),
    ...(f.gradeLevelId && { gradeLevelId: f.gradeLevelId === "none" ? null : f.gradeLevelId }),
    ...(f.lessonId && { libraryLessonId: f.lessonId === "none" ? null : f.lessonId }),
    ...(f.reviewStatus && { reviewStatus: f.reviewStatus }),
    ...(f.difficulty && { difficulty: f.difficulty }),
    ...(f.type && { type: f.type }),
    ...(f.topic && { topic: { contains: f.topic, mode: "insensitive" } }),
    ...(f.q && { OR: [{ content: { contains: f.q, mode: "insensitive" } }, { topic: { contains: f.q, mode: "insensitive" } }] }),
  };
}

export const questionInclude = {
  options: { orderBy: { order: "asc" } },
  subject: { select: { subjectName: true } },
  gradeLevel: { select: { gradeName: true } },
  libraryLesson: { select: { id: true, title: true } },
  teacher: { select: { fullName: true } },
  _count: { select: { exercises: true } },
} satisfies Prisma.QuestionInclude;

export const listQuestions = (f: QuestionFilter, skip: number, take: number) =>
  prisma.$transaction([
    prisma.question.findMany({ where: where(f), include: questionInclude, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.question.count({ where: where(f) }),
  ]);

export const findQuestion = (id: string) => prisma.question.findUnique({ where: { id }, include: questionInclude });

export const teacherSubjects = (teacherId: string) =>
  prisma.teacherSubject.findMany({ where: { teacherId }, include: { subject: true }, orderBy: { subject: { subjectName: "asc" } } });

const labelOf = (type: string, i: number) => (type === "TRUE_FALSE_GROUP" ? "abcdef" : "ABCDEF")[i];

function data(teacherId: string, q: QuestionInput): Prisma.QuestionUncheckedCreateInput {
  return {
    teacherId,
    subjectId: q.subjectId,
    gradeLevelId: q.gradeLevelId,
    libraryLessonId: q.libraryLessonId,
    reviewStatus: "READY", // giáo viên tự soạn/sửa = đã xác nhận
    reviewNote: null,
    type: q.type,
    content: q.content,
    images: q.images,
    topic: q.topic || null,
    difficulty: q.difficulty,
    explanation: q.explanation || null,
    answerKey: q.type === "SHORT_ANSWER" ? (q.answerKey ?? undefined) : undefined,
    options: {
      create: q.type === "SHORT_ANSWER" ? [] : q.options.map((o, i) => ({ label: labelOf(q.type, i), content: o.content, images: o.images, isCorrect: o.isCorrect, order: i })),
    },
  };
}

export const createQuestion = (teacherId: string, q: QuestionInput) => prisma.question.create({ data: data(teacherId, q) });

/** Sửa tại chỗ: xóa rồi tạo lại các đáp án (chỉ dùng khi câu hỏi chưa có bài nộp nào). */
export const replaceQuestion = (id: string, teacherId: string, q: QuestionInput) =>
  prisma.$transaction(async (tx) => {
    await tx.questionOption.deleteMany({ where: { questionId: id } });
    const { options, ...rest } = data(teacherId, q);
    return tx.question.update({ where: { id }, data: { ...rest, answerKey: q.type === "SHORT_ANSWER" && q.answerKey ? q.answerKey : Prisma.DbNull, options } });
  });

/** Số bài tập đã có học sinh nộp đang dùng câu hỏi này (khác 0 => câu hỏi phải giữ nguyên, sửa = tạo phiên bản mới). */
export const countSubmittedUsage = (questionId: string) =>
  prisma.exerciseQuestion.count({ where: { questionId, exercise: { submissions: { some: {} } } } });

/** Phiên bản mới: lưu trữ câu cũ, bài tập chưa có bài nộp được trỏ sang câu mới. */
export const versionQuestion = (oldId: string, teacherId: string, q: QuestionInput) =>
  prisma.$transaction(async (tx) => {
    const created = await tx.question.create({ data: data(teacherId, q) });
    await tx.question.update({ where: { id: oldId }, data: { archivedAt: new Date() } });
    await tx.libraryExerciseQuestion.updateMany({ where: { questionId: oldId }, data: { questionId: created.id } }); // bài tập mẫu trong kho dùng phiên bản mới
    const open = await tx.exerciseQuestion.findMany({ where: { questionId: oldId, exercise: { submissions: { none: {} } } }, select: { id: true } });
    if (open.length) await tx.exerciseQuestion.updateMany({ where: { id: { in: open.map((x) => x.id) } }, data: { questionId: created.id } });
    return created;
  });

export const deleteOrArchive = async (id: string) => {
  await prisma.libraryExerciseQuestion.deleteMany({ where: { questionId: id } }); // gỡ khỏi các bài tập mẫu
  const used = await prisma.exerciseQuestion.count({ where: { questionId: id } });
  if (used) return prisma.question.update({ where: { id }, data: { archivedAt: new Date() } });
  return prisma.question.delete({ where: { id } });
};

/** Số câu hỏi theo (môn, khối) của một giáo viên — cho màn hình chọn môn → khối. */
export const countByGrade = (teacherId: string) =>
  prisma.question.groupBy({ by: ["subjectId", "gradeLevelId"], where: { teacherId, archivedAt: null, parentId: null }, _count: { _all: true } });
export const countNeedsReview = (teacherId: string) => prisma.question.count({ where: { teacherId, archivedAt: null, reviewStatus: "NEEDS_REVIEW" } });
export const markReady = (teacherId: string, ids: string[]) => prisma.question.updateMany({ where: { teacherId, id: { in: ids } }, data: { reviewStatus: "READY", reviewNote: null } });
