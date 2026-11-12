"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { attachmentLinks as parseLinks } from "@/lib/storage/validation";
import { parseNumber } from "@/modules/question/question.grading";
import * as bank from "@/modules/bank/bank.service";

const TEACH = [...MANAGER_ROLES, ...TEACHING_ROLES];
const refresh = () => { revalidatePath("/ngan-hang-bai-hoc", "layout"); revalidatePath("/ngan-hang-cau-hoi"); };
const showAnswersOf = (fd: FormData) => str(fd, "showAnswers") || "AFTER_DUE";
const secureOf = (fd: FormData) => str(fd, "secureMode") === "1";
const shuffleQOf = (fd: FormData) => str(fd, "shuffleQuestions") === "1";
const shuffleOOf = (fd: FormData) => str(fd, "shuffleOptions") === "1";
const intIn = (fd: FormData, k: string, min: number, max: number, d: number) => { const n = parseInt(str(fd, k).replace(/\D/g, ""), 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const attemptSettings = (fd: FormData) => ({ maxAttempts: intIn(fd, "maxAttempts", 1, 10, 1), attemptScoring: str(fd, "attemptScoring") === "LAST" ? "LAST" : "BEST", timeLimitMinutes: intIn(fd, "timeLimitMinutes", 0, 600, 0), allowReview: str(fd, "allowReview") === "1" });
const maxViolationsOf = (fd: FormData) => { const n = parseInt(str(fd, "maxViolations").replace(/\D/g, ""), 10); return Number.isFinite(n) ? Math.min(n, 20) : 3; };
const intOf = (v: string) => { const n = parseInt(v.replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : undefined; };

/* ---------- Bài học ---------- */
export const createLessonAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  // Bài học ôn tập: tạo kèm một bài tập ôn tập liên kết các bài học trước (và bốc sẵn câu hỏi nếu giáo viên nhập số câu)
  const review = str(fd, "review") === "1";
  const sources = fd.getAll("sourceLessonIds").map(String);
  if (review && !sources.length) throw new Error("Chọn ít nhất một bài học trước để ôn tập");
  const lesson = await bank.createLesson(me, { subjectId: str(fd, "subjectId"), gradeLevelId: str(fd, "gradeLevelId"), title: str(fd, "title"), content: str(fd, "content"), attachments: parseLinks(str(fd, "attachments")), orderNo: intOf(str(fd, "orderNo")) });
  await audit(me.email, "create_library_lesson", "LibraryLesson", lesson.id);
  if (review) {
    const ex = await bank.createExercise(me, lesson.id, { title: `Ôn tập: ${lesson.title}`, kind: "REVIEW", quizMode: true, instructions: "", attachments: [], showAnswers: "AFTER_SUBMIT", sourceLessonIds: sources });
    const total = intOf(str(fd, "autoTotal"));
    if (total) await bank.autoPick(me, ex.id, { total }, true, 1);
    refresh();
    redirect(`/ngan-hang-bai-hoc/${lesson.id}?tab=bai-tap&ex=${ex.id}`);
  }
  refresh();
  redirect(`/ngan-hang-bai-hoc/${lesson.id}`);
});
export const updateLessonAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  await bank.updateLesson(me, str(fd, "id"), { title: str(fd, "title"), content: str(fd, "content"), attachments: parseLinks(str(fd, "attachments")), orderNo: intOf(str(fd, "orderNo")) });
  refresh();
  return "Đã lưu bài học";
});
export const archiveLessonAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const lesson = await bank.getLesson(me, str(fd, "id"));
  await bank.archiveLesson(me, lesson.id);
  await audit(me.email, "delete_library_lesson", "LibraryLesson", lesson.id);
  refresh();
  redirect(`/ngan-hang-bai-hoc?${new URLSearchParams({ subjectId: lesson.subjectId, gradeLevelId: lesson.gradeLevelId })}`);
});
export const assignQuestionsAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const n = await bank.assignQuestions(me, str(fd, "lessonId"), fd.getAll("questionIds").map(String));
  refresh();
  return `Đã thêm ${n} câu hỏi vào bài học`;
});

/* ---------- Bài tập mẫu ---------- */
export const createExerciseAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const lessonId = str(fd, "lessonId");
  const ex = await bank.createExercise(me, lessonId, {
    title: str(fd, "title"), kind: str(fd, "kind") === "REVIEW" ? "REVIEW" : "NORMAL", quizMode: str(fd, "quizMode") !== "0", instructions: str(fd, "instructions"),
    attachments: parseLinks(str(fd, "attachments")), showAnswers: showAnswersOf(fd), secureMode: secureOf(fd), maxViolations: maxViolationsOf(fd), shuffleQuestions: shuffleQOf(fd), shuffleOptions: shuffleOOf(fd), ...attemptSettings(fd), sourceLessonIds: fd.getAll("sourceLessonIds").map(String),
  });
  refresh();
  redirect(`/ngan-hang-bai-hoc/${lessonId}?tab=bai-tap&ex=${ex.id}`);
});
export const updateExerciseAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  await bank.updateExercise(me, str(fd, "id"), { title: str(fd, "title"), instructions: str(fd, "instructions"), attachments: parseLinks(str(fd, "attachments")), showAnswers: showAnswersOf(fd), secureMode: secureOf(fd), maxViolations: maxViolationsOf(fd), shuffleQuestions: shuffleQOf(fd), shuffleOptions: shuffleOOf(fd), ...attemptSettings(fd), sourceLessonIds: fd.getAll("sourceLessonIds").map(String) });
  refresh();
  return "Đã lưu bài tập";
});
export const archiveExerciseAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const ex = await bank.getExercise(me, str(fd, "id"));
  await bank.archiveExercise(me, ex.id);
  refresh();
  redirect(`/ngan-hang-bai-hoc/${ex.lessonId}?tab=bai-tap`);
});

/* ---------- Câu hỏi trong bài tập mẫu ---------- */
export const addExerciseQuestions = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const n = await bank.addQuestions(me, str(fd, "exerciseId"), fd.getAll("questionIds").map(String), parseNumber(str(fd, "points") || "1"));
  refresh();
  return n ? `Đã thêm ${n} câu hỏi` : "Các câu hỏi đã có trong bài tập";
});
export const setExercisePoints = wrap(async (fd) => { const me = await assertRole(...TEACH); await bank.updatePoints(me, str(fd, "id"), parseNumber(str(fd, "points"))); refresh(); return "Đã lưu điểm"; });
export const moveExerciseQuestion = wrap(async (fd) => { const me = await assertRole(...TEACH); await bank.moveQuestion(me, str(fd, "id"), str(fd, "dir") === "-1" ? -1 : 1); refresh(); return "Đã đổi thứ tự"; });
export const removeExerciseQuestion = wrap(async (fd) => { const me = await assertRole(...TEACH); await bank.removeQuestion(me, str(fd, "id")); refresh(); return "Đã bỏ câu hỏi khỏi bài tập"; });

/** Bốc ngẫu nhiên: số câu theo từng bài (pl_<lessonId>) hoặc tổng số câu, kèm tỉ lệ độ khó. */
export const autoPickAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const perLesson: Record<string, number> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("pl_") && typeof v === "string" && intOf(v)) perLesson[k.slice(3)] = intOf(v)!;
  const num = (k: string) => Math.max(0, parseNumber(str(fd, k) || "0") || 0);
  const spec = { total: intOf(str(fd, "total")), perLesson: Object.keys(perLesson).length ? perLesson : undefined, difficulty: { EASY: num("rEasy"), MEDIUM: num("rMedium"), HARD: num("rHard") } };
  const r = await bank.autoPick(me, str(fd, "exerciseId"), spec, str(fd, "replace") === "1", parseNumber(str(fd, "points") || "1") || 1);
  refresh();
  return r.shortage.length ? `Đã thêm ${r.added} câu. Chưa đủ câu ở: ${r.shortage.join("; ")}` : `Đã thêm ${r.added} câu`;
});

/* ---------- Đăng cho lớp (thao tác ở phần Giảng dạy) ---------- */
/** Từ trang lớp trong "Giảng dạy": đăng một bài học trong kho (kèm các bài tập chọn) cho lớp-môn-học kỳ đang xem. */
export const publishLessonToClassAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const lessonId = str(fd, "lessonId");
  if (!lessonId) throw new Error("Chọn bài học cần đăng");
  const items = fd.getAll(`ex_${lessonId}`).map(String).map((exerciseId) => { const d = opt(fd, `due_${exerciseId}`); return { exerciseId, dueDate: d ? new Date(d) : null }; });
  const r = await bank.publishLesson(me, lessonId, { assignmentIds: [str(fd, "assignmentId")], items });
  await audit(me.email, "publish_library_lesson", "LibraryLesson", lessonId);
  revalidatePath("/bai-hoc", "layout");
  revalidatePath("/giang-day", "layout");
  revalidatePath("/lop-cua-toi", "layout");
  return r.posts || r.exercises ? `Đã đăng: ${r.posts} bài học mới, ${r.exercises} bài tập${r.skipped ? ` (bỏ qua ${r.skipped} bài tập đã đăng trước đó)` : ""}` : "Bài học và các bài tập đã chọn đã được đăng trước đó";
});

/** Trang bài học của lớp: lấy một bài tập mẫu từ kho. */
export const publishExerciseToPostAction = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const postId = str(fd, "lessonPostId");
  const d = opt(fd, "dueDate");
  const ex = await bank.publishExerciseToPost(me, postId, str(fd, "libraryExerciseId"), d ? new Date(d) : null);
  revalidatePath("/bai-hoc", "layout");
  redirect(`/bai-hoc/${postId}?tab=bai-tap&ex=${ex.id}`);
});
