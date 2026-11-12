import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import type { SessionUser } from "../src/lib/auth/session";
import { anthropicExtractor, coercePayload, ImportError, splitTextForAI, type ExtractedQuestion, type Extractor } from "../src/modules/importer/extractor";
import { normalizeQuestion } from "../src/modules/importer/normalize";
import { approveImportQuestions, createImportJob, getImportJob, runImportJob } from "../src/modules/importer/importer.service";
import { ConflictError, ForbiddenError } from "../src/shared/errors";
import { buildDocx } from "./importer-docx-fixture";

const base = (over: Partial<ExtractedQuestion> = {}): ExtractedQuestion => ({
  type: "SINGLE_CHOICE", content: "Câu hỏi $x^2$", imageRefs: [], explanation: "", difficulty: "MEDIUM", topic: "", answerSource: "FILE", needsFigure: false, points: 1, confidence: 0.95, note: "",
  options: [{ content: "A", isCorrect: false, imageRefs: [] }, { content: "B", isCorrect: true, imageRefs: [] }, { content: "C", isCorrect: false, imageRefs: [] }],
  answerKey: { mode: "TEXT", answers: [], tolerance: 0 }, ...over,
});

test("splitTextForAI: văn bản ngắn một đoạn, văn bản dài cắt ở ranh giới câu và kèm phần cuối tham chiếu", () => {
  assert.equal(splitTextForAI("Câu 1. abc").length, 1);
  const body = Array.from({ length: 40 }, (_, i) => `Câu ${i + 1}. ${"nội dung ".repeat(30)}`).join("\n");
  const chunks = splitTextForAI(body + "\nBảng đáp án: 1A 2B", 3000, 200);
  assert.ok(chunks.length > 1);
  for (const c of chunks.slice(0, -1)) { assert.match(c.body, /^Câu \d+\./); assert.ok(c.reference.includes("Bảng đáp án")); }
  assert.equal(chunks.at(-1)!.reference, "");
  assert.equal(chunks.map((c) => c.body).join("\n").replace(/\n/g, "").length >= body.replace(/\n/g, "").length, true);
});

test("coercePayload: không tin dữ liệu AI, giá trị sai được đưa về mặc định", () => {
  assert.deepEqual(coercePayload("rác"), { testTitle: "", warnings: [], questions: [] });
  const p = coercePayload({ testTitle: " Đề 1 ", questions: [{ type: "LẠ", content: " x ", options: [{ content: 5 }, null], difficulty: "??", points: -2, confidence: 9, answerKey: { mode: "X", answers: ["1", 2, ""] } }, null, 7] });
  assert.equal(p.testTitle, "Đề 1");
  assert.equal(p.questions.length, 1);
  const q = p.questions[0];
  assert.equal(q.type, "SINGLE_CHOICE"); assert.equal(q.content, "x"); assert.equal(q.difficulty, "MEDIUM"); assert.equal(q.points, 1); assert.equal(q.confidence, 1);
  assert.deepEqual(q.answerKey, { mode: "TEXT", answers: ["1", "2"], tolerance: 0 }); assert.equal(q.options.length, 1);
});

test("normalizeQuestion: câu sạch -> READY; các vấn đề -> NEEDS_REVIEW kèm lý do", () => {
  const none = new Set<number>();
  const ok = normalizeQuestion(base(), none)!;
  assert.equal(ok.reviewStatus, "READY"); assert.equal(ok.reviewNote, null);

  assert.equal(normalizeQuestion(base({ content: "  [[IMG:3]] ", imageRefs: [] }), none), null); // rỗng
  assert.equal(normalizeQuestion(base({ content: "", imageRefs: [2] }), new Set([2]))!.imageRefs[0], 2); // chỉ có ảnh vẫn giữ

  const noKey = normalizeQuestion(base({ options: base().options.map((o) => ({ ...o, isCorrect: false })) }), none)!;
  assert.equal(noKey.reviewStatus, "NEEDS_REVIEW"); assert.match(noKey.reviewNote!, /đáp án đúng/);

  const many = normalizeQuestion(base({ options: base().options.map((o) => ({ ...o, isCorrect: true })) }), none)!;
  assert.equal(many.options.filter((o) => o.isCorrect).length, 1); assert.equal(many.reviewStatus, "NEEDS_REVIEW");

  const tf = normalizeQuestion(base({ type: "TRUE_FALSE_GROUP" }), none)!; // chỉ 3 ý
  assert.equal(tf.reviewStatus, "NEEDS_REVIEW"); assert.match(tf.reviewNote!, /4 ý/);

  const num = normalizeQuestion(base({ type: "SHORT_ANSWER", options: [], answerKey: { mode: "NUMBER", answers: ["abc"], tolerance: 0.1 } }), none)!;
  assert.equal(num.answerKey!.mode, "TEXT"); assert.equal(num.reviewStatus, "NEEDS_REVIEW");
  const num2 = normalizeQuestion(base({ type: "SHORT_ANSWER", options: [], answerKey: { mode: "NUMBER", answers: ["3,14"], tolerance: 0.01 } }), none)!;
  assert.equal(num2.reviewStatus, "READY"); assert.equal(num2.answerKey!.tolerance, 0.01);

  assert.equal(normalizeQuestion(base({ answerSource: "AI_SOLVED" }), none)!.reviewStatus, "NEEDS_REVIEW");
  assert.match(normalizeQuestion(base({ answerSource: "UNKNOWN" }), none)!.reviewNote!, /Không tìm thấy đáp án/);
  assert.match(normalizeQuestion(base({ needsFigure: true }), none)!.reviewNote!, /hình vẽ/);
  assert.match(normalizeQuestion(base({ confidence: 0.4 }), none)!.reviewNote!, /không chắc/);
  assert.deepEqual(normalizeQuestion(base({ imageRefs: [1, 9] }), new Set([1]))!.imageRefs, [1]); // ảnh không có thật bị bỏ
});

test("extractor thật báo lỗi tiếng Việt rõ ràng khi thiếu ANTHROPIC_API_KEY", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(anthropicExtractor({ kind: "QUESTIONS", fileName: "a.txt", subjectName: "Toán", gradeName: "Khối 10", source: { type: "text", text: "Câu 1", imageCount: 0 } }),
      (e: unknown) => e instanceof ImportError && e.message.includes("Chưa cấu hình khóa AI (ANTHROPIC_API_KEY)"));
  } finally { if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved; }
});

// ---------------------------------------------------------------- luồng có CSDL + kho tệp (cần RUN_DATABASE_TESTS=1 và MINIO_ENDPOINT/Cloudinary)
const dbReady = process.env.RUN_DATABASE_TESTS === "1" && !!(process.env.MINIO_ENDPOINT || process.env.CLOUDINARY_CLOUD_NAME);

test("database: nhập tệp Word bằng extractor giả -> câu hỏi, ảnh, bài tập mẫu, duyệt, lỗi và giới hạn", { skip: !dbReady }, async () => {
  const u = await prisma.user.findFirst({ where: { email: "giaovien@sonha.edu.vn" }, include: { teacher: true } });
  assert.ok(u?.teacher, "cần dữ liệu seed giaovien@sonha.edu.vn");
  const user: SessionUser = { userId: u.id, email: u.email, roles: ["SUBJECT_TEACHER"], teacherId: u.teacher.id, studentId: null };
  const other: SessionUser = { ...user, userId: "x", teacherId: "khong-ton-tai" };
  const subject = await prisma.subject.findUniqueOrThrow({ where: { subjectName: "Vật lý" } });
  const grade = await prisma.gradeLevel.findFirstOrThrow({ orderBy: { sortOrder: "asc" } });
  const otherSubject = await prisma.subject.findFirstOrThrow({ where: { teachers: { none: { teacherId: u.teacher.id } } } });
  const buffer = await buildDocx();
  const jobIds: string[] = [], lessonIds: string[] = [];
  const savedLimit = process.env.AI_IMPORT_DAILY_LIMIT;
  process.env.AI_IMPORT_DAILY_LIMIT = "1000";

  const fake: Extractor = async ({ kind, source }) => {
    assert.equal(source.type, "text");
    if (source.type === "text") { assert.match(source.text, /\\frac\{a\}\{b\}/); assert.equal(source.imageCount, 2); }
    return {
      testTitle: kind === "TEST" ? "Đề kiểm tra 15 phút" : "", warnings: ["Bỏ qua câu tự luận số 9"],
      questions: [
        base({ content: "Cho hình [[IMG:1]] tính $\\frac{a}{b}$", imageRefs: [1], points: 2 }),
        base({ type: "TRUE_FALSE_GROUP", options: ["a", "b", "c", "d"].map((c, i) => ({ content: `ý ${c}`, isCorrect: i % 2 === 0, imageRefs: i === 0 ? [2] : [] })) }),
        base({ type: "SHORT_ANSWER", options: [], answerKey: { mode: "NUMBER", answers: ["2"], tolerance: 0.05 } }),
        base({ content: "Câu có hình nhưng AI không có ảnh", needsFigure: true, answerSource: "AI_SOLVED" }),
        base({ content: "", imageRefs: [] }), // rỗng: bị bỏ
      ],
    };
  };

  try {
    // --- QUESTIONS
    const job = await createImportJob(user, { kind: "QUESTIONS", subjectId: subject.id, gradeLevelId: grade.id, libraryLessonId: null, fileName: "tap-cau-hoi.docx", buffer });
    jobIds.push(job.id);
    assert.equal(job.status, "PENDING");
    assert.equal((await prisma.storedFile.findUniqueOrThrow({ where: { id: job.fileId } })).purpose, "IMPORT");
    await runImportJob(user, job.id, buffer, fake);
    const done = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(done.status, "DONE"); assert.equal(done.questionCount, 4); assert.equal(done.flaggedCount, 1); assert.ok(done.finishedAt);
    assert.deepEqual(done.warnings, ["Bỏ qua câu tự luận số 9", "Bỏ qua 1 câu rỗng."]);
    const mine = await getImportJob(user, job.id);
    assert.equal(mine!.questions.length, 4);
    assert.equal(await getImportJob(other, job.id), null);
    const [q1, q2, q3, q4] = mine!.questions;
    assert.equal(q1.teacherId, user.teacherId); assert.equal(q1.gradeLevelId, grade.id); assert.equal(q1.subjectId, subject.id); assert.equal(q1.importJobId, job.id);
    assert.equal(q1.content, "Cho hình  tính $\\frac{a}{b}$"); assert.equal((q1.images as string[]).length, 1);
    const url = (q1.images as string[])[0];
    const file = await prisma.storedFile.findUniqueOrThrow({ where: { id: url.split("/").pop()! } });
    assert.equal(file.purpose, "QUESTION"); assert.equal(file.uploadedBy, user.userId); assert.equal(file.assignmentId, null);
    assert.equal(q2.options.length, 4); assert.equal((q2.options[0].images as string[]).length, 1); assert.equal(q2.options[0].label, "a");
    assert.deepEqual(q3.answerKey, { mode: "NUMBER", answers: ["2"], tolerance: 0.05 });
    assert.equal(q1.reviewStatus, "READY"); assert.equal(q4.reviewStatus, "NEEDS_REVIEW");
    // duyệt: người khác không duyệt được, chủ phiên duyệt được
    await assert.rejects(approveImportQuestions(other, job.id), ForbiddenError);
    assert.equal(await approveImportQuestions(user, job.id), 1);
    assert.equal((await getImportJob(user, job.id))!.questions.every((q) => q.reviewStatus === "READY" && q.reviewNote === null), true);

    // --- TEST (không chọn bài học -> tự tạo bài học + bài tập mẫu theo thứ tự và điểm)
    const t = await createImportJob(user, { kind: "TEST", subjectId: subject.id, gradeLevelId: grade.id, libraryLessonId: null, fileName: "de.docx", buffer });
    jobIds.push(t.id);
    await runImportJob(user, t.id, buffer, fake);
    const tdone = await prisma.importJob.findUniqueOrThrow({ where: { id: t.id } });
    assert.equal(tdone.status, "DONE");
    assert.ok(tdone.libraryLessonId && tdone.libraryExerciseId); lessonIds.push(tdone.libraryLessonId);
    const lesson = await prisma.libraryLesson.findUniqueOrThrow({ where: { id: tdone.libraryLessonId } });
    assert.equal(lesson.title, "Đề kiểm tra 15 phút"); assert.equal(lesson.teacherId, user.teacherId); assert.equal(lesson.gradeLevelId, grade.id);
    const ex = await prisma.libraryExercise.findUniqueOrThrow({ where: { id: tdone.libraryExerciseId }, include: { questions: { orderBy: { order: "asc" }, include: { question: true } } } });
    assert.equal(ex.quizMode, true); assert.equal(ex.kind, "NORMAL"); assert.equal(ex.questions.length, 4);
    assert.deepEqual(ex.questions.map((x) => x.order), [1, 2, 3, 4]); assert.equal(ex.questions[0].points, 2);
    assert.equal(ex.questions[3].question.reviewStatus, "NEEDS_REVIEW");
    // TEST vào bài học có sẵn
    const t2 = await createImportJob(user, { kind: "TEST", subjectId: subject.id, gradeLevelId: grade.id, libraryLessonId: lesson.id, fileName: "de2.docx", buffer });
    jobIds.push(t2.id);
    await runImportJob(user, t2.id, buffer, fake);
    assert.equal((await prisma.importJob.findUniqueOrThrow({ where: { id: t2.id } })).libraryLessonId, lesson.id);

    // --- extractor lỗi -> FAILED có thông báo, không ném ra ngoài
    const bad = await createImportJob(user, { kind: "QUESTIONS", subjectId: subject.id, gradeLevelId: grade.id, libraryLessonId: null, fileName: "x.docx", buffer });
    jobIds.push(bad.id);
    await runImportJob(user, bad.id, buffer, async () => { throw new ImportError("AI quá tải"); });
    const failed = await prisma.importJob.findUniqueOrThrow({ where: { id: bad.id } });
    assert.equal(failed.status, "FAILED"); assert.equal(failed.error, "AI quá tải");
    // --- extractor mặc định, không có khóa -> FAILED với thông báo cấu hình
    const savedKey = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    const nokey = await createImportJob(user, { kind: "QUESTIONS", subjectId: subject.id, gradeLevelId: grade.id, libraryLessonId: null, fileName: "y.docx", buffer });
    jobIds.push(nokey.id);
    await runImportJob(user, nokey.id, buffer);
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    assert.match((await prisma.importJob.findUniqueOrThrow({ where: { id: nokey.id } })).error!, /Chưa cấu hình khóa AI \(ANTHROPIC_API_KEY\)/);
    // --- không có câu nào -> FAILED rõ ràng
    const empty = await createImportJob(user, { kind: "QUESTIONS", subjectId: subject.id, gradeLevelId: grade.id, libraryLessonId: null, fileName: "z.docx", buffer });
    jobIds.push(empty.id);
    await runImportJob(user, empty.id, buffer, async () => ({ testTitle: "", warnings: [], questions: [] }));
    assert.match((await prisma.importJob.findUniqueOrThrow({ where: { id: empty.id } })).error!, /Không tìm thấy câu hỏi nào/);

    // --- kiểm tra đầu vào và hạn mức
    const args = { kind: "QUESTIONS", subjectId: subject.id, gradeLevelId: grade.id, libraryLessonId: null, fileName: "a.docx", buffer };
    await assert.rejects(createImportJob(other, args), ForbiddenError);
    await assert.rejects(createImportJob(user, { ...args, subjectId: otherSubject.id }), ForbiddenError);
    await assert.rejects(createImportJob(user, { ...args, fileName: "a.exe" }), ConflictError);
    await assert.rejects(createImportJob(user, { ...args, kind: "KHAC" }), ConflictError);
    await assert.rejects(createImportJob(user, { ...args, libraryLessonId: "khong-co" }), ForbiddenError);
    process.env.AI_IMPORT_DAILY_LIMIT = "1";
    await assert.rejects(createImportJob(user, args), /giới hạn 1 lần/);
  } finally {
    if (savedLimit === undefined) delete process.env.AI_IMPORT_DAILY_LIMIT; else process.env.AI_IMPORT_DAILY_LIMIT = savedLimit;
    const jobs = await prisma.importJob.findMany({ where: { id: { in: jobIds } } });
    const qs = await prisma.question.findMany({ where: { importJobId: { in: jobIds } }, select: { id: true } });
    const qids = qs.map((q) => q.id);
    await prisma.libraryExerciseQuestion.deleteMany({ where: { questionId: { in: qids } } });
    await prisma.libraryExercise.deleteMany({ where: { lessonId: { in: lessonIds } } });
    await prisma.questionOption.deleteMany({ where: { questionId: { in: qids } } });
    await prisma.question.deleteMany({ where: { id: { in: qids } } });
    await prisma.importJob.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.libraryLesson.deleteMany({ where: { id: { in: lessonIds } } });
    await prisma.storedFile.deleteMany({ where: { OR: [{ id: { in: jobs.map((j) => j.fileId) } }, { uploadedBy: u.id, purpose: "QUESTION", fileName: { startsWith: "import-" } }] } });
  }
});
