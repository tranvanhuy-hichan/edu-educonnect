import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { validateFileReferences } from "@/lib/storage/files";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import { notifyUsers } from "@/modules/notification/notification.service";
import { teacherSubjects } from "@/modules/question/question.repository";
import { exerciseInput, lessonInput } from "./bank.schema";
import { pickQuestions, type PickSpec } from "./bank.pick";
import * as repo from "./bank.repository";

const requireTeacher = (user: SessionUser) => {
  if (!user.teacherId) throw new ForbiddenError("Chỉ giáo viên mới dùng được ngân hàng bài học");
  return user.teacherId;
};
const firstError = (e: { issues: { message: string }[] }) => new ConflictError(e.issues[0]?.message ?? "Dữ liệu không hợp lệ");

async function ownLesson(user: SessionUser, id: string) {
  const teacherId = requireTeacher(user);
  const lesson = await repo.findLesson(id);
  if (!lesson || lesson.archivedAt || lesson.teacherId !== teacherId) throw new ForbiddenError("Không tìm thấy bài học hoặc không có quyền");
  return lesson;
}
async function ownExercise(user: SessionUser, id: string) {
  const teacherId = requireTeacher(user);
  const ex = await repo.findExercise(id);
  if (!ex || ex.archivedAt || ex.lesson.teacherId !== teacherId) throw new ForbiddenError("Không tìm thấy bài tập hoặc không có quyền");
  return ex;
}

/* ================= Bài học mẫu ================= */
export async function createLesson(user: SessionUser, raw: unknown) {
  const teacherId = requireTeacher(user);
  const p = lessonInput.safeParse(raw);
  if (!p.success) throw firstError(p.error);
  const input = p.data;
  if (!(await teacherSubjects(teacherId)).some((s) => s.subjectId === input.subjectId)) throw new ForbiddenError("Bạn không phụ trách môn này");
  await validateFileReferences(user, input.attachments, "", "LIBRARY");
  const orderNo = input.orderNo ?? (await repo.maxLessonOrder(teacherId, input.subjectId, input.gradeLevelId)) + 1;
  return repo.createLesson({ teacherId, subjectId: input.subjectId, gradeLevelId: input.gradeLevelId, title: input.title, content: input.content, attachments: input.attachments, orderNo });
}

/** Môn và khối của bài học không đổi sau khi tạo (câu hỏi và bài tập của bài gắn theo đó). */
export async function updateLesson(user: SessionUser, id: string, raw: unknown) {
  const lesson = await ownLesson(user, id);
  const p = lessonInput.safeParse({ ...(raw as object), subjectId: lesson.subjectId, gradeLevelId: lesson.gradeLevelId });
  if (!p.success) throw firstError(p.error);
  await validateFileReferences(user, p.data.attachments, "", "LIBRARY");
  return repo.updateLesson(id, { title: p.data.title, content: p.data.content, attachments: p.data.attachments, orderNo: p.data.orderNo ?? lesson.orderNo });
}
export async function archiveLesson(user: SessionUser, id: string) {
  await ownLesson(user, id);
  await repo.archiveLesson(id);
}
export const getLesson = (user: SessionUser, id: string) => ownLesson(user, id);

/** Xem (không sửa): giáo viên chủ sở hữu hoặc quản lý/quản trị. */
export async function viewLesson(user: SessionUser, id: string) {
  if (user.teacherId) return ownLesson(user, id);
  if (!isAdmin(user)) throw new ForbiddenError("Không có quyền xem bài học này");
  const lesson = await repo.findLesson(id);
  if (!lesson || lesson.archivedAt) throw new ForbiddenError("Không tìm thấy bài học");
  return lesson;
}
export async function viewExercise(user: SessionUser, id: string) {
  if (user.teacherId) return ownExercise(user, id);
  if (!isAdmin(user)) throw new ForbiddenError("Không có quyền xem bài tập này");
  const ex = await repo.findExercise(id);
  if (!ex || ex.archivedAt) throw new ForbiddenError("Không tìm thấy bài tập");
  return ex;
}

/** Gán các câu hỏi "chưa phân bài" (cùng môn, cùng khối) vào bài học. */
export async function assignQuestions(user: SessionUser, lessonId: string, questionIds: string[]) {
  const lesson = await ownLesson(user, lessonId);
  const qs = await repo.findQuestions([...new Set(questionIds)]);
  if (!qs.length || qs.some((q) => q.teacherId !== lesson.teacherId || q.subjectId !== lesson.subjectId || q.gradeLevelId !== lesson.gradeLevelId)) throw new ConflictError("Chỉ gán được câu hỏi của bạn, cùng môn và cùng khối với bài học");
  return (await repo.assignQuestions(lesson.teacherId, qs.map((q) => q.id), lessonId)).count;
}

/* ================= Bài tập mẫu ================= */
async function checkSources(teacherId: string, lesson: { id: string; subjectId: string; gradeLevelId: string }, ids: string[]) {
  const unique = [...new Set(ids)].filter((x) => x !== lesson.id);
  const found = await Promise.all(unique.map((x) => repo.findLesson(x)));
  if (found.some((l) => !l || l.archivedAt || l.teacherId !== teacherId || l.subjectId !== lesson.subjectId || l.gradeLevelId !== lesson.gradeLevelId)) throw new ConflictError("Chỉ liên kết được các bài học cùng môn, cùng khối của bạn");
  return unique;
}

export async function createExercise(user: SessionUser, lessonId: string, raw: unknown) {
  const lesson = await ownLesson(user, lessonId);
  const p = exerciseInput.safeParse(raw);
  if (!p.success) throw firstError(p.error);
  const input = p.data;
  const sources = await checkSources(lesson.teacherId, lesson, input.kind === "REVIEW" ? input.sourceLessonIds : []);
  if (input.kind === "REVIEW" && !sources.length) throw new ConflictError("Bài ôn tập cần liên kết ít nhất một bài học trước");
  await validateFileReferences(user, input.attachments, "", "LIBRARY");
  const orderNo = (await repo.maxExerciseOrder(lessonId)) + 1;
  return repo.createExercise({ lessonId, title: input.title, kind: input.kind, quizMode: input.quizMode, instructions: input.instructions, attachments: input.attachments, showAnswers: input.showAnswers, secureMode: input.quizMode && input.secureMode, maxViolations: input.maxViolations, shuffleQuestions: input.quizMode && input.shuffleQuestions, shuffleOptions: input.quizMode && input.shuffleOptions, maxAttempts: input.maxAttempts, attemptScoring: input.attemptScoring, timeLimitMinutes: input.timeLimitMinutes, allowReview: input.allowReview, orderNo }, sources);
}

export async function updateExercise(user: SessionUser, id: string, raw: unknown) {
  const ex = await ownExercise(user, id);
  const p = exerciseInput.safeParse({ ...(raw as object), kind: ex.kind, quizMode: ex.quizMode });
  if (!p.success) throw firstError(p.error);
  const input = p.data;
  const sources = ex.kind === "REVIEW" ? await checkSources(ex.lesson.teacherId, ex.lesson, input.sourceLessonIds) : null;
  if (sources && !sources.length) throw new ConflictError("Bài ôn tập cần liên kết ít nhất một bài học trước");
  await validateFileReferences(user, input.attachments, "", "LIBRARY");
  return repo.updateExercise(id, { title: input.title, instructions: input.instructions, attachments: input.attachments, showAnswers: input.showAnswers, secureMode: ex.quizMode && input.secureMode, maxViolations: input.maxViolations, shuffleQuestions: ex.quizMode && input.shuffleQuestions, shuffleOptions: ex.quizMode && input.shuffleOptions, maxAttempts: input.maxAttempts, attemptScoring: input.attemptScoring, timeLimitMinutes: input.timeLimitMinutes, allowReview: input.allowReview }, sources);
}
export async function archiveExercise(user: SessionUser, id: string) {
  await ownExercise(user, id);
  await repo.archiveExercise(id);
}
export const getExercise = (user: SessionUser, id: string) => ownExercise(user, id);

/** Bài học mà câu hỏi của bài tập này được phép lấy từ: bài thường = chính bài học; bài ôn tập = chính bài học + các bài đã liên kết. */
const allowedLessonIds = (ex: { kind: string; lessonId: string; sources: { lessonId: string }[] }) =>
  ex.kind === "REVIEW" ? [ex.lessonId, ...ex.sources.map((s) => s.lessonId)] : [ex.lessonId];

export async function addQuestions(user: SessionUser, exerciseId: string, questionIds: string[], points: number) {
  const ex = await ownExercise(user, exerciseId);
  if (!ex.quizMode) throw new ConflictError("Đây là bài tập tự luận, không có câu hỏi trắc nghiệm");
  if (!questionIds.length) throw new ConflictError("Chọn ít nhất một câu hỏi");
  if (!(points > 0 && points <= 100)) throw new ConflictError("Số điểm mỗi câu phải lớn hơn 0");
  const ids = [...new Set(questionIds)];
  const qs = await repo.findQuestions(ids);
  const allowed = new Set(allowedLessonIds(ex));
  for (const q of qs) {
    if (q.teacherId !== ex.lesson.teacherId || q.archivedAt) throw new ForbiddenError("Câu hỏi không thuộc ngân hàng của bạn");
    if (q.subjectId !== ex.lesson.subjectId || q.gradeLevelId !== ex.lesson.gradeLevelId) throw new ConflictError("Chỉ chọn được câu hỏi cùng môn, cùng khối với bài học");
    if (q.reviewStatus !== "READY") throw new ConflictError("Có câu hỏi đang chờ kiểm tra, hãy duyệt trước khi thêm vào bài tập");
    if (!q.libraryLessonId || !allowed.has(q.libraryLessonId)) throw new ConflictError(ex.kind === "REVIEW" ? "Chỉ chọn được câu hỏi của bài này và các bài đã liên kết" : "Bài tập thường chỉ lấy câu hỏi của chính bài học này");
  }
  if (qs.length !== ids.length) throw new ConflictError("Có câu hỏi không tồn tại");
  const have = new Set(await repo.questionIdsOf(exerciseId));
  let order = (await repo.maxQuestionOrder(exerciseId)) + 1;
  const fresh = ids.filter((id) => !have.has(id));
  await repo.addQuestions(fresh.map((questionId) => ({ exerciseId, questionId, order: order++, points })));
  return fresh.length;
}

async function ownLink(user: SessionUser, id: string) {
  const link = await repo.findLink(id);
  if (!link || link.exercise.lesson.teacherId !== requireTeacher(user)) throw new ForbiddenError("Không tìm thấy câu hỏi trong bài tập");
  return link;
}
export async function updatePoints(user: SessionUser, id: string, points: number) {
  await ownLink(user, id);
  if (!(points > 0 && points <= 100)) throw new ConflictError("Số điểm phải lớn hơn 0");
  await repo.updatePoints(id, points);
}
export async function removeQuestion(user: SessionUser, id: string) {
  await ownLink(user, id);
  await repo.removeLink(id);
}
export async function moveQuestion(user: SessionUser, id: string, dir: -1 | 1) {
  const link = await ownLink(user, id);
  const all = await repo.listLinks(link.exerciseId);
  const i = all.findIndex((x) => x.id === id), j = i + dir;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await repo.reorder(all.map((x) => x.id));
}

/** Bốc câu ngẫu nhiên theo số câu từng bài + tỉ lệ độ khó. `replace`: bỏ bộ câu hiện tại rồi bốc lại. */
export async function autoPick(user: SessionUser, exerciseId: string, spec: PickSpec, replace: boolean, points = 1) {
  const ex = await ownExercise(user, exerciseId);
  if (!ex.quizMode) throw new ConflictError("Đây là bài tập tự luận");
  const lessonIds = ex.kind === "REVIEW" && ex.sources.length ? ex.sources.map((s) => s.lessonId) : [ex.lessonId];
  if (!spec.perLesson && !(spec.total && spec.total > 0)) throw new ConflictError("Nhập số câu cần lấy");
  if (replace) await repo.clearLinks(exerciseId);
  const exclude = await repo.questionIdsOf(exerciseId);
  const pool = await repo.pool(ex.lesson.teacherId, ex.lesson.subjectId, ex.lesson.gradeLevelId, lessonIds, exclude);
  const { ids, shortage } = pickQuestions(pool.map((q) => ({ id: q.id, lessonId: q.libraryLessonId, difficulty: q.difficulty })), lessonIds, spec);
  let order = (await repo.maxQuestionOrder(exerciseId)) + 1;
  if (ids.length) await repo.addQuestions(ids.map((questionId) => ({ exerciseId, questionId, order: order++, points })));
  const titles = new Map([[ex.lesson.id, ex.lesson.title], ...ex.sources.map((s) => [s.lesson.id, s.lesson.title] as const)]);
  return { added: ids.length, shortage: shortage.map((s) => { const [id, n] = s.split(":"); return `${titles.get(id) ?? "Bài học"}: thiếu ${n} câu`; }) };
}

/* ================= Đăng cho lớp ================= */
export async function publishTargets(user: SessionUser, lessonId: string) {
  const lesson = await ownLesson(user, lessonId);
  return repo.eligibleAssignments(lesson.teacherId, lesson.subjectId, lesson.gradeLevelId);
}

type Copyable = Awaited<ReturnType<typeof repo.exercisesWithQuestions>>[number];

function assertPublishable(ex: Copyable) {
  const bad = ex.questions.filter((q) => q.question.reviewStatus !== "READY" || q.question.archivedAt).length;
  if (bad) throw new ConflictError(`Bài tập "${ex.title}" còn ${bad} câu chờ kiểm tra hoặc đã bị xóa. Hãy duyệt/gỡ các câu đó trước khi đăng.`);
  if (ex.quizMode && !ex.questions.length) throw new ConflictError(`Bài tập "${ex.title}" chưa có câu hỏi nào.`);
}
const copyExercise = (lessonPostId: string, ex: Copyable, dueDate: Date | null) =>
  repo.createExerciseCopy({
    lessonPostId, title: ex.title, content: ex.instructions, attachments: ex.attachments, quizMode: ex.quizMode, showAnswers: ex.showAnswers, dueDate, sourceExerciseId: ex.id, secureMode: ex.secureMode, maxViolations: ex.maxViolations, shuffleQuestions: ex.shuffleQuestions, shuffleOptions: ex.shuffleOptions, maxAttempts: ex.maxAttempts, attemptScoring: ex.attemptScoring, timeLimitMinutes: ex.timeLimitMinutes, allowReview: ex.allowReview,
    questions: ex.questions.map((q) => ({ questionId: q.questionId, order: q.order, points: q.points })),
  });

async function notifyClass(assignmentId: string, postId: string, lines: { title: string; content: string; exId?: string }[]) {
  try {
    const a = await repo.notificationRecipients(assignmentId);
    const userIds = a?.schoolClass.enrollments.map((e) => e.student.userId).filter((x): x is string => !!x) ?? [];
    for (const l of lines) await notifyUsers(userIds, { title: l.title, content: l.content, type: "ASSIGNMENT", link: `/bai-hoc/${postId}${l.exId ? `?tab=bai-tap&ex=${l.exId}` : ""}` });
  } catch { /* không làm gián đoạn việc đăng nếu gửi thông báo lỗi */ }
}
const dueText = (d: Date | null) => (d ? new Date(d).toLocaleDateString("vi-VN") : "Không có hạn");

/** Đăng bài học mẫu (kèm các bài tập chọn) cho nhiều lớp: mỗi lớp một bản sao độc lập. Lớp đã có bản đăng của bài này thì chỉ thêm các bài tập chưa đăng. */
export async function publishLesson(user: SessionUser, lessonId: string, input: { assignmentIds: string[]; items: { exerciseId: string; dueDate: Date | null }[] }) {
  const lesson = await ownLesson(user, lessonId);
  const assignmentIds = [...new Set(input.assignmentIds)];
  if (!assignmentIds.length) throw new ConflictError("Chọn ít nhất một lớp để đăng");
  const assignments = await repo.findAssignments(assignmentIds);
  if (assignments.length !== assignmentIds.length) throw new ForbiddenError("Lớp-môn không tồn tại");
  for (const a of assignments) {
    if (!(await canManageClassSubjectAssignment(user, a.id))) throw new ForbiddenError(`Bạn không phụ trách lớp ${a.schoolClass.className}`);
    if (a.subjectId !== lesson.subjectId || a.schoolClass.gradeLevelId !== lesson.gradeLevelId) throw new ConflictError(`Lớp ${a.schoolClass.className} không cùng môn/khối với bài học này`);
  }
  const exercises = input.items.length ? await repo.exercisesWithQuestions(input.items.map((i) => i.exerciseId)) : [];
  if (exercises.length !== new Set(input.items.map((i) => i.exerciseId)).size || exercises.some((e) => e.lessonId !== lessonId)) throw new ForbiddenError("Bài tập không thuộc bài học này");
  exercises.forEach(assertPublishable);
  const due = new Map(input.items.map((i) => [i.exerciseId, i.dueDate]));

  let posts = 0, copies = 0, skipped = 0;
  for (const a of assignments) {
    let post = await repo.findPostBySource(a.id, lesson.id);
    const lines: { title: string; content: string; exId?: string }[] = [];
    if (!post) {
      post = await repo.createPost({ assignmentId: a.id, title: lesson.title, content: lesson.content, attachments: (lesson.attachments as string[] | null) ?? [], sourceLessonId: lesson.id });
      posts++;
      lines.push({ title: `Bài học mới: ${lesson.title}`, content: `Môn ${lesson.subject.subjectName} vừa đăng bài học "${lesson.title}".` });
    }
    const done = new Set(await repo.publishedExerciseSources(post.id));
    for (const ex of exercises) {
      if (done.has(ex.id)) { skipped++; continue; }
      const created = await copyExercise(post.id, ex, due.get(ex.id) ?? null);
      copies++;
      lines.push({ title: `Bài tập mới: ${ex.title}`, content: `Môn ${lesson.subject.subjectName} vừa giao bài tập mới trong bài học "${lesson.title}". Hạn nộp: ${dueText(due.get(ex.id) ?? null)}.`, exId: created.id });
    }
    await notifyClass(a.id, post.id, lines);
  }
  return { posts, exercises: copies, skipped };
}

/** Từ trang bài học của lớp: lấy một bài tập trong kho đăng vào bài học đang mở. */
export async function publishExerciseToPost(user: SessionUser, lessonPostId: string, libraryExerciseId: string, dueDate: Date | null) {
  const post = await repo.findPostForPublish(lessonPostId);
  if (!post) throw new ForbiddenError("Bài học không tồn tại");
  if (!(await canManageClassSubjectAssignment(user, post.assignmentId))) throw new ForbiddenError("Không có quyền thao tác trên bài học này");
  const [ex] = await repo.exercisesWithQuestions([libraryExerciseId]);
  if (!ex) throw new ForbiddenError("Bài tập mẫu không tồn tại");
  const lesson = await repo.findLesson(ex.lessonId);
  if (!lesson || lesson.archivedAt || lesson.teacherId !== post.assignment.teacherId) throw new ForbiddenError("Bài tập mẫu không thuộc bạn");
  if (lesson.subjectId !== post.assignment.subjectId || lesson.gradeLevelId !== post.assignment.schoolClass.gradeLevelId) throw new ConflictError("Bài tập mẫu không cùng môn/khối với lớp này");
  assertPublishable(ex);
  if ((await repo.publishedExerciseSources(post.id)).includes(ex.id)) throw new ConflictError("Bài tập này đã được đăng trong bài học này rồi");
  const created = await copyExercise(post.id, ex, dueDate);
  await notifyClass(post.assignmentId, post.id, [{ title: `Bài tập mới: ${ex.title}`, content: `Môn ${lesson.subject.subjectName} vừa giao bài tập mới trong bài học "${post.title}". Hạn nộp: ${dueText(dueDate)}.`, exId: created.id }]);
  return created;
}
export async function libraryExercisesForPost(user: SessionUser, lessonPostId: string) {
  const post = await repo.findPostForPublish(lessonPostId);
  if (!post || !(await canManageClassSubjectAssignment(user, post.assignmentId))) return [];
  const done = new Set(await repo.publishedExerciseSources(post.id));
  const list = await repo.libraryExercisesFor(post.assignment.teacherId, post.assignment.subjectId, post.assignment.schoolClass.gradeLevelId);
  return list.filter((e) => !done.has(e.id));
}
