import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Thùng rác theo kiểu "chụp rồi xoá": trước khi xoá thật, chụp bản ghi chính và mọi bản ghi phụ thuộc (kể cả bản ghi bị xoá lan theo)
 * vào TrashItem trong CÙNG giao dịch. Khôi phục = tạo lại đúng các bản ghi đó với mã cũ. Cách này không đụng tới mọi truy vấn
 * hiện có (không cần thêm điều kiện "chưa xoá" ở khắp nơi) và dữ liệu đã xoá không còn xuất hiện ở bất kỳ danh sách nào.
 */
export const TRASH_DAYS = 30;
export type TrashKind = "STUDENT" | "CLASS" | "LESSON_POST" | "QUESTION" | "LIBRARY_LESSON";
type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown>;
type Payload = { tables: Record<string, Row[]>; meta: Record<string, unknown> };
type Delegate = { findMany(a: unknown): Promise<Row[]>; createMany(a: unknown): Promise<unknown>; create(a: unknown): Promise<unknown>; updateMany(a: unknown): Promise<unknown> };
const model = (tx: Tx, name: string) => (tx as unknown as Record<string, Delegate>)[name];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ids = (rows: Row[], field = "id") => rows.map((r) => r[field] as string);

async function save(tx: Tx, kind: TrashKind, label: string, detail: string | null, tables: Record<string, Row[]>, deletedBy: string, meta: Record<string, unknown> = {}) {
  await tx.trashItem.create({ data: { kind, label, detail, payload: clone({ tables, meta }) as Prisma.InputJsonValue, deletedBy, expiresAt: new Date(Date.now() + TRASH_DAYS * 86_400_000) } });
}

// ── Chèn lại bản ghi phụ thuộc: lô trước, lỗi (khoá ngoại đã mất) thì thử từng dòng; dòng nào không chèn được thì bỏ qua và ghi chú ──
let savepoint = 0;
async function reinsert(tx: Tx, notes: string[], label: string, name: string, rows: Row[]) {
  if (!rows.length) return;
  const attempt = async (data: Row[]) => {
    const sp = `trash_sp_${++savepoint}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${sp}`);
    try { await model(tx, name).createMany({ data }); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`); return true; }
    catch { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`); return false; }
  };
  if (await attempt(rows)) return;
  let skipped = 0;
  for (const row of rows) if (!(await attempt([row]))) skipped++;
  if (skipped) notes.push(`${label}: bỏ qua ${skipped}/${rows.length} dòng vì dữ liệu liên quan đã bị xoá`);
}

// ───────────────────────── Học sinh ─────────────────────────
export function trashStudent(deletedBy: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: student.userId } });
    const tables = {
      user: [user], student: [student],
      enrollments: await tx.studentClassEnrollment.findMany({ where: { studentId } }),
      lessonPostViews: await tx.lessonPostView.findMany({ where: { studentId } }),
      subjectTermAverages: await tx.subjectTermAverage.findMany({ where: { studentId } }),
      yearEndResults: await tx.yearEndResult.findMany({ where: { studentId } }),
      quizAttempts: await tx.quizAttempt.findMany({ where: { studentId } }), // xoá lan theo học sinh
      examViolations: await tx.examViolation.findMany({ where: { studentId } }),
    };
    const monitorOf = ids(await tx.schoolClass.findMany({ where: { monitorStudentId: studentId }, select: { id: true } }));
    const enrollment = tables.enrollments[0] ? await tx.schoolClass.findUnique({ where: { id: tables.enrollments[0].schoolClassId as string }, select: { className: true } }) : null;
    await tx.studentClassEnrollment.deleteMany({ where: { studentId } });
    await tx.lessonPostView.deleteMany({ where: { studentId } });
    await tx.subjectTermAverage.deleteMany({ where: { studentId } });
    await tx.yearEndResult.deleteMany({ where: { studentId } });
    await tx.student.delete({ where: { id: studentId } }); // quizAttempt, examViolation xoá lan
    await tx.user.delete({ where: { id: student.userId } }); // thông báo, phiên đăng nhập xoá lan
    await save(tx, "STUDENT", student.fullName, [student.code, enrollment && `lớp ${enrollment.className}`].filter(Boolean).join(" · ") || null, tables, deletedBy, { monitorOf });
  });
}
async function restoreStudent(tx: Tx, p: Payload, notes: string[]) {
  const t = p.tables;
  await tx.user.create({ data: t.user[0] as Prisma.UserUncheckedCreateInput });
  await tx.student.create({ data: t.student[0] as Prisma.StudentUncheckedCreateInput });
  await reinsert(tx, notes, "Xếp lớp", "studentClassEnrollment", t.enrollments);
  await reinsert(tx, notes, "Lượt xem bài học", "lessonPostView", t.lessonPostViews);
  await reinsert(tx, notes, "Điểm trung bình môn", "subjectTermAverage", t.subjectTermAverages);
  await reinsert(tx, notes, "Kết quả cuối năm", "yearEndResult", t.yearEndResults);
  await reinsert(tx, notes, "Lượt làm bài", "quizAttempt", t.quizAttempts);
  await reinsert(tx, notes, "Vi phạm thi", "examViolation", t.examViolations);
  const monitorOf = (p.meta.monitorOf as string[]) ?? [];
  if (monitorOf.length) await tx.schoolClass.updateMany({ where: { id: { in: monitorOf }, monitorStudentId: null }, data: { monitorStudentId: t.student[0].id as string } });
  notes.push("Thông báo và phiên đăng nhập cũ của học sinh không được khôi phục.");
}

// ───────────────────────── Lớp học ─────────────────────────
export function trashClass(deletedBy: string, classId: string) {
  return prisma.$transaction(async (tx) => {
    const cls = await tx.schoolClass.findUniqueOrThrow({ where: { id: classId }, include: { gradeLevel: { select: { gradeName: true } }, academicYear: { select: { yearName: true } } } });
    const { gradeLevel, academicYear, ...row } = cls;
    const tables = {
      schoolClass: [row],
      classSubjects: await tx.classSubject.findMany({ where: { schoolClassId: classId } }), // xoá lan
      emulationScores: await tx.classEmulationScore.findMany({ where: { schoolClassId: classId } }),
      enrollments: await tx.studentClassEnrollment.findMany({ where: { schoolClassId: classId } }),
    };
    await tx.classEmulationScore.deleteMany({ where: { schoolClassId: classId } });
    await tx.studentClassEnrollment.deleteMany({ where: { schoolClassId: classId } });
    await tx.schoolClass.delete({ where: { id: classId } });
    await save(tx, "CLASS", `Lớp ${cls.className}`, `${gradeLevel.gradeName} · ${academicYear.yearName} · ${tables.enrollments.length} học sinh`, tables, deletedBy);
  });
}
async function restoreClass(tx: Tx, p: Payload, notes: string[]) {
  const t = p.tables;
  const cls = { ...t.schoolClass[0] } as Row;
  // GVCN/phòng/lớp trưởng đã bị xoá sau đó thì bỏ liên kết thay vì không khôi phục được cả lớp
  for (const [field, name] of [["homeroomTeacherId", "teacher"], ["roomId", "room"], ["monitorStudentId", "student"]] as const) {
    if (cls[field] && !(await model(tx, name).findMany({ where: { id: cls[field] }, select: { id: true } })).length) { cls[field] = null; notes.push(`Đã bỏ liên kết ${field} vì bản ghi đó không còn tồn tại`); }
  }
  await tx.schoolClass.create({ data: cls as Prisma.SchoolClassUncheckedCreateInput });
  await reinsert(tx, notes, "Môn học của lớp", "classSubject", t.classSubjects);
  await reinsert(tx, notes, "Điểm thi đua", "classEmulationScore", t.emulationScores);
  await reinsert(tx, notes, "Học sinh trong lớp", "studentClassEnrollment", t.enrollments);
}

// ───────────────────────── Bài học của lớp (LessonPost) ─────────────────────────
export function trashLessonPost(deletedBy: string, postId: string) {
  return prisma.$transaction(async (tx) => {
    const post = await tx.lessonPost.findUniqueOrThrow({ where: { id: postId }, include: { assignment: { select: { schoolClass: { select: { className: true } }, subject: { select: { subjectName: true } } } } } });
    const { assignment, ...row } = post;
    const exercises = await tx.exercise.findMany({ where: { lessonPostId: postId } });
    const exerciseIds = ids(exercises);
    const submissions = await tx.assignmentSubmission.findMany({ where: { exerciseId: { in: exerciseIds } } });
    const tables = {
      lessonPost: [row], exercises,
      exerciseQuestions: await tx.exerciseQuestion.findMany({ where: { exerciseId: { in: exerciseIds } } }),
      submissions,
      answers: await tx.studentAnswer.findMany({ where: { submissionId: { in: ids(submissions) } } }),
      examViolations: await tx.examViolation.findMany({ where: { exerciseId: { in: exerciseIds } } }), // xoá lan theo bài tập
      views: await tx.lessonPostView.findMany({ where: { lessonPostId: postId } }),
    };
    await tx.studentAnswer.deleteMany({ where: { submissionId: { in: ids(submissions) } } });
    await tx.assignmentSubmission.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
    await tx.exerciseQuestion.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
    await tx.exercise.deleteMany({ where: { lessonPostId: postId } });
    await tx.lessonPostView.deleteMany({ where: { lessonPostId: postId } });
    await tx.lessonPost.delete({ where: { id: postId } });
    await save(tx, "LESSON_POST", post.title, `${assignment.subject.subjectName} · lớp ${assignment.schoolClass.className} · ${exercises.length} bài tập, ${submissions.length} bài nộp`, tables, deletedBy);
  });
}
async function restoreLessonPost(tx: Tx, p: Payload, notes: string[]) {
  const t = p.tables;
  await tx.lessonPost.create({ data: t.lessonPost[0] as Prisma.LessonPostUncheckedCreateInput });
  await model(tx, "exercise").createMany({ data: t.exercises });
  await reinsert(tx, notes, "Câu hỏi của bài tập", "exerciseQuestion", t.exerciseQuestions);
  await reinsert(tx, notes, "Bài nộp", "assignmentSubmission", t.submissions);
  await reinsert(tx, notes, "Câu trả lời", "studentAnswer", t.answers);
  await reinsert(tx, notes, "Vi phạm thi", "examViolation", t.examViolations);
  await reinsert(tx, notes, "Lượt xem", "lessonPostView", t.views);
}

// ───────────────────────── Câu hỏi (ngân hàng) ─────────────────────────
/** Xoá hoặc lưu trữ (nếu đã được bài tập dùng) một câu hỏi; cả hai cách đều vào thùng rác để hoàn tác được. */
export function trashQuestion(deletedBy: string, questionId: string) {
  return prisma.$transaction(async (tx) => {
    const q = await tx.question.findUniqueOrThrow({ where: { id: questionId }, include: { options: true } });
    const { options, ...row } = q;
    const links = await tx.libraryExerciseQuestion.findMany({ where: { questionId } });
    await tx.libraryExerciseQuestion.deleteMany({ where: { questionId } }); // gỡ khỏi các bài tập mẫu
    const used = await tx.exerciseQuestion.count({ where: { questionId } });
    const mode = used ? "archived" : "deleted";
    if (used) await tx.question.update({ where: { id: questionId }, data: { archivedAt: new Date() } });
    else await tx.question.delete({ where: { id: questionId } }); // đáp án xoá lan
    const preview = String((q as { content?: string }).content ?? "").replace(/\s+/g, " ").slice(0, 80);
    await save(tx, "QUESTION", preview || "Câu hỏi", mode === "archived" ? "Đã lưu trữ (có bài tập đang dùng)" : "Đã xoá", { question: [row], options, links }, deletedBy, { mode, questionId });
  });
}
async function restoreQuestion(tx: Tx, p: Payload, notes: string[]) {
  const t = p.tables;
  if (p.meta.mode === "archived") await tx.question.update({ where: { id: p.meta.questionId as string }, data: { archivedAt: null } });
  else {
    await tx.question.create({ data: t.question[0] as Prisma.QuestionUncheckedCreateInput });
    await reinsert(tx, notes, "Đáp án", "questionOption", t.options);
  }
  await reinsert(tx, notes, "Liên kết với bài tập mẫu", "libraryExerciseQuestion", t.links);
}

// ───────────────────────── Bài học trong kho (lưu trữ) ─────────────────────────
export function trashLibraryLesson(deletedBy: string, lessonId: string) {
  return prisma.$transaction(async (tx) => {
    const lesson = await tx.libraryLesson.findUniqueOrThrow({ where: { id: lessonId } });
    const questionIds = ids(await tx.question.findMany({ where: { libraryLessonId: lessonId }, select: { id: true } }));
    const exerciseIds = ids(await tx.libraryExercise.findMany({ where: { lessonId, archivedAt: null }, select: { id: true } }));
    const sources = await tx.libraryExerciseSource.findMany({ where: { lessonId } });
    await tx.question.updateMany({ where: { libraryLessonId: lessonId }, data: { libraryLessonId: null } });
    await tx.libraryExercise.updateMany({ where: { lessonId }, data: { archivedAt: new Date() } });
    await tx.libraryExerciseSource.deleteMany({ where: { lessonId } });
    await tx.libraryLesson.update({ where: { id: lessonId }, data: { archivedAt: new Date() } });
    await save(tx, "LIBRARY_LESSON", lesson.title, `${questionIds.length} câu hỏi, ${exerciseIds.length} bài tập mẫu`, { sources }, deletedBy, { lessonId, questionIds, exerciseIds });
  });
}
async function restoreLibraryLesson(tx: Tx, p: Payload, notes: string[]) {
  const lessonId = p.meta.lessonId as string;
  await tx.libraryLesson.update({ where: { id: lessonId }, data: { archivedAt: null } });
  await tx.question.updateMany({ where: { id: { in: (p.meta.questionIds as string[]) ?? [] }, libraryLessonId: null }, data: { libraryLessonId: lessonId } });
  await tx.libraryExercise.updateMany({ where: { id: { in: (p.meta.exerciseIds as string[]) ?? [] } }, data: { archivedAt: null } });
  await reinsert(tx, notes, "Nguồn của bài tập mẫu", "libraryExerciseSource", p.tables.sources);
}

// ───────────────────────── Danh sách / khôi phục / xoá hẳn ─────────────────────────
const RESTORE: Record<TrashKind, (tx: Tx, p: Payload, notes: string[]) => Promise<void>> = {
  STUDENT: restoreStudent, CLASS: restoreClass, LESSON_POST: restoreLessonPost, QUESTION: restoreQuestion, LIBRARY_LESSON: restoreLibraryLesson,
};

export const listTrash = (kind?: string) => prisma.trashItem.findMany({
  where: { restoredAt: null, expiresAt: { gt: new Date() }, ...(kind ? { kind } : {}) }, orderBy: { deletedAt: "desc" }, take: 300,
  select: { id: true, kind: true, label: true, detail: true, deletedBy: true, deletedAt: true, expiresAt: true },
});
export const countTrash = () => prisma.trashItem.count({ where: { restoredAt: null, expiresAt: { gt: new Date() } } });

/** Khôi phục trong một giao dịch: lỗi (trùng mã/email, thiếu bản ghi cha...) thì không thay đổi gì. */
export function restoreTrash(id: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.trashItem.findUnique({ where: { id } });
    if (!item || item.restoredAt) return { ok: false as const, error: "Mục này không còn trong thùng rác" };
    if (item.expiresAt.getTime() <= Date.now()) return { ok: false as const, error: "Mục này đã quá hạn lưu và sắp bị xoá hẳn" };
    const notes: string[] = [];
    await RESTORE[item.kind as TrashKind](tx, item.payload as unknown as Payload, notes);
    await tx.trashItem.update({ where: { id }, data: { restoredAt: new Date() } });
    return { ok: true as const, label: item.label, kind: item.kind, notes };
  }, { timeout: 30_000 });
}
export const purgeTrash = (id: string) => prisma.trashItem.deleteMany({ where: { id, restoredAt: null } });
export const purgeExpiredTrash = () => prisma.$executeRaw`DELETE FROM "TrashItem" WHERE "expiresAt" <= NOW() OR ("restoredAt" IS NOT NULL AND "restoredAt" < NOW() - INTERVAL '30 days')`;
