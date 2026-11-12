import type { SessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/session";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import { gradeQuestion, toGrade10 } from "./question.grading";
import { attemptsLeft, canRevealAnswers, deadlineOf, isOvertime, shouldReplaceSummary } from "./quiz-attempts";
import * as repo from "./quiz.repository";
import { notifyUsers } from "@/modules/notification/notification.service";

/** Chỉ giáo viên phụ trách lớp-môn (hoặc quản lý) thao tác trên bộ câu hỏi của bài tập trắc nghiệm. */
async function loadManagedQuiz(user: SessionUser, exerciseId: string) {
  const ex = await repo.findExercise(exerciseId);
  if (!ex) throw new ForbiddenError("Bài tập không tồn tại");
  if (!(await canManageClassSubjectAssignment(user, ex.lessonPost.assignmentId))) throw new ForbiddenError("Không có quyền thao tác trên bài tập này");
  if (!ex.quizMode) throw new ConflictError("Đây không phải bài tập trắc nghiệm");
  return ex;
}
function assertEditable(ex: { _count: { submissions: number } }) {
  if (ex._count.submissions) throw new ConflictError("Bài tập đã có học sinh nộp, không thể thay đổi câu hỏi. Hãy cho học sinh làm lại hoặc tạo bài tập mới.");
}
async function loadEditableByLink(user: SessionUser, id: string) {
  const eq = await repo.findExerciseQuestion(id);
  if (!eq) throw new ConflictError("Không tìm thấy câu hỏi trong bài tập");
  assertEditable(await loadManagedQuiz(user, eq.exerciseId));
  return eq;
}

export async function addQuestionsToExercise(user: SessionUser, exerciseId: string, questionIds: string[], points: number) {
  const ex = await loadManagedQuiz(user, exerciseId);
  assertEditable(ex);
  if (!questionIds.length) throw new ConflictError("Chọn ít nhất một câu hỏi");
  if (!(points > 0 && points <= 100)) throw new ConflictError("Số điểm mỗi câu phải lớn hơn 0");
  const assignment = ex.lessonPost.assignment;
  const questions = await repo.findQuestions(questionIds);
  // câu hỏi phải của giáo viên đang thao tác (hoặc giáo viên phụ trách lớp, nếu quản lý thao tác) và đúng môn
  const owner = isAdmin(user) ? assignment.teacherId : user.teacherId;
  if (questions.length !== new Set(questionIds).size || questions.some((q) => q.teacherId !== owner)) throw new ForbiddenError("Câu hỏi không thuộc ngân hàng của bạn");
  if (questions.some((q) => q.subjectId !== assignment.subjectId)) throw new ConflictError("Chỉ chọn được câu hỏi cùng môn với bài học");
  if (questions.some((q) => q.gradeLevelId !== assignment.schoolClass.gradeLevelId)) throw new ConflictError("Chỉ chọn được câu hỏi cùng khối với lớp này");
  if (questions.some((q) => q.reviewStatus !== "READY")) throw new ConflictError("Có câu hỏi đang chờ kiểm tra, hãy duyệt trong Ngân hàng câu hỏi trước");
  let order = (await repo.maxOrder(exerciseId)) + 1;
  const have = new Set(await repo.questionIdsOf(exerciseId));
  const fresh = [...new Set(questionIds)].filter((id) => !have.has(id));
  await repo.addQuestions(fresh.map((questionId) => ({ exerciseId, questionId, order: order++, points })));
  return fresh.length;
}

export async function updateExerciseQuestionPoints(user: SessionUser, id: string, points: number) {
  await loadEditableByLink(user, id);
  if (!(points > 0 && points <= 100)) throw new ConflictError("Số điểm phải lớn hơn 0");
  await repo.updatePoints(id, points);
}

export async function removeExerciseQuestion(user: SessionUser, id: string) {
  await loadEditableByLink(user, id);
  await repo.removeQuestion(id);
}

export async function moveExerciseQuestion(user: SessionUser, id: string, dir: -1 | 1) {
  const eq = await loadEditableByLink(user, id);
  const all = await repo.listExerciseQuestions(eq.exerciseId);
  const i = all.findIndex((x) => x.id === id), j = i + dir;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await repo.reorder(all.map((x) => x.id));
}

type GradingExercise = NonNullable<Awaited<ReturnType<typeof repo.findExerciseForGrading>>>;

/** Chấm bài và ghi nhận một lượt làm. Dùng chung cho nộp bình thường, tự nộp do vi phạm và đóng lượt quá giờ. */
async function gradeAndRecord(ex: GradingExercise, studentId: string, answers: Record<string, unknown>, ctx: { attemptId: string | null; attemptNo: number; autoSubmitted: boolean; overtime: boolean; submittedAt: Date }) {
  const graded = ex.questions.map((eq) => ({ eq, ...gradeQuestion(eq.question, answers[eq.questionId], eq.points) }));
  const earned = graded.reduce((t, g) => t + g.score, 0);
  const max = ex.questions.reduce((t, eq) => t + eq.points, 0);
  const grade = toGrade10(earned, max);
  try {
    const r = await repo.recordAttempt({
      snapshot: JSON.parse(JSON.stringify({ questions: ex.questions, answers: graded.map((g) => ({ questionId: g.eq.questionId, answer: answers[g.eq.questionId] ?? null, score: g.score, maxScore: g.eq.points, isCorrect: g.isCorrect })) })),
      exerciseId: ex.id, studentId, attemptId: ctx.attemptId, attemptNo: ctx.attemptNo, scoring: ex.attemptScoring, submittedAt: ctx.submittedAt,
      isLate: Boolean(ex.dueDate && ctx.submittedAt > ex.dueDate), grade, autoSubmitted: ctx.autoSubmitted, overtime: ctx.overtime,
      answers: graded.map((g) => ({ questionId: g.eq.questionId, answer: answers[g.eq.questionId], score: g.score, maxScore: g.eq.points, isCorrect: g.isCorrect })),
      shouldReplace: (existing) => shouldReplaceSummary(ex.attemptScoring, existing, grade),
    });
    return Object.assign(r.submission, { attemptGrade: grade, attemptNo: ctx.attemptNo, counted: r.counted });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ConflictError("Lượt làm bài này đã được nộp rồi");
    throw e;
  }
}

async function loadStudentExercise(user: SessionUser, exerciseId: string) {
  if (!user.studentId) throw new ForbiddenError("Chỉ học sinh mới được làm bài");
  const ex = await repo.findExerciseForGrading(exerciseId);
  if (!ex || !ex.quizMode) throw new ForbiddenError("Bài tập không tồn tại");
  if (!(await repo.isStudentInClass(user.studentId, ex.lessonPost.assignment.schoolClassId))) throw new ForbiddenError("Bạn không thuộc lớp học của môn này");
  if (!ex.questions.length) throw new ConflictError("Bài tập chưa có câu hỏi");
  return { ex, studentId: user.studentId };
}

/** Lượt làm đang dở đã quá giờ (kể cả thời gian du di): đóng lại với những gì chưa nộp = 0 điểm, để vẫn tính là đã dùng một lượt. */
async function closeExpiredAttempt(ex: GradingExercise, studentId: string) {
  const active = await repo.findActiveAttempt(ex.id, studentId);
  if (active && isOvertime(active.startedAt, ex.timeLimitMinutes)) {
    await gradeAndRecord(ex, studentId, {}, { attemptId: active.id, attemptNo: active.attemptNo, autoSubmitted: true, overtime: true, submittedAt: deadlineOf(active.startedAt, ex.timeLimitMinutes) });
  }
}

/** Bắt đầu một lượt làm bài (bài có giới hạn thời gian hoặc thi nghiêm túc). Làm dở rồi vào lại thì trả về lượt đang chạy, đồng hồ không đặt lại. */
export async function startAttempt(user: SessionUser, exerciseId: string) {
  const { ex, studentId } = await loadStudentExercise(user, exerciseId);
  await closeExpiredAttempt(ex, studentId);
  const used = await repo.countSubmittedAttempts(exerciseId, studentId);
  let active = await repo.findActiveAttempt(exerciseId, studentId);
  if (!active) {
    if (attemptsLeft(ex.maxAttempts + await repo.extraAttempts(ex.id, studentId), used) <= 0) throw new ConflictError("Em đã hết lượt làm bài này");
    try { active = await repo.createAttempt(exerciseId, studentId, used + 1); } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      active = await repo.findActiveAttempt(exerciseId, studentId); // hai yêu cầu cùng lúc: lấy lượt vừa được tạo
      if (!active) throw e;
    }
  }
  return { attemptNo: active.attemptNo, startedAt: active.startedAt.toISOString(), serverNow: new Date().toISOString(), timeLimitMinutes: ex.timeLimitMinutes };
}

/** Trạng thái làm bài của học sinh: đã dùng mấy lượt, còn mấy lượt, lượt đang dở, lịch sử điểm. */
export async function quizAttemptState(user: SessionUser, exerciseId: string) {
  const { ex, studentId } = await loadStudentExercise(user, exerciseId);
  await closeExpiredAttempt(ex, studentId);
  const [history, active] = await Promise.all([repo.listAttempts(exerciseId, studentId), repo.findActiveAttempt(exerciseId, studentId)]);
  const max = ex.maxAttempts + await repo.extraAttempts(ex.id, studentId);
  return { used: history.length, max, left: attemptsLeft(max, history.length), history, active };
}

/**
 * Học sinh nộp bài trắc nghiệm: chấm tự động từng câu, lưu điểm từng câu và điểm hệ 10.
 * Số lần làm tối đa, giờ làm bài và cách tính điểm (cao nhất / lần cuối) theo cài đặt của bài tập.
 */
export async function submitQuiz(user: SessionUser, exerciseId: string, answers: Record<string, unknown>, opts: { autoSubmitted?: boolean } = {}) {
  const { ex, studentId } = await loadStudentExercise(user, exerciseId);
  await closeExpiredAttempt(ex, studentId);
  const used = await repo.countSubmittedAttempts(exerciseId, studentId);
  if (attemptsLeft(ex.maxAttempts + await repo.extraAttempts(ex.id, studentId), used) <= 0) throw new ConflictError(ex.maxAttempts > 1 ? "Em đã hết lượt làm bài này" : "Bạn đã nộp bài tập này rồi");
  const active = await repo.findActiveAttempt(exerciseId, studentId);
  if ((ex.timeLimitMinutes > 0 || ex.secureMode) && !active) throw new ConflictError("Hãy bấm Bắt đầu làm bài trước khi nộp (bài có giới hạn thời gian)");
  const now = new Date();
  const overtime = !!active && isOvertime(active.startedAt, ex.timeLimitMinutes, now);
  const violations = ex.secureMode && active ? await repo.countViolations(ex.id, studentId, active.startedAt) : 0;
  const forced = ex.secureMode && isOverLimit(violations, ex.maxViolations);
  const sub = await gradeAndRecord(ex, studentId, answers, { attemptId: active?.id ?? null, attemptNo: active?.attemptNo ?? used + 1, autoSubmitted: forced || opts.autoSubmitted === true, overtime, submittedAt: now });
  if (forced || opts.autoSubmitted) await notifyAutoSubmit(studentId, ex.lessonPost.assignment.teacherId, ex.title, ex.lessonPostId, exerciseId);
  return sub;
}

/** Bài bị nộp tự động do vi phạm: báo cho học sinh và giáo viên phụ trách (chuông thông báo). Lỗi gửi thông báo không làm hỏng việc nộp bài. */
async function notifyAutoSubmit(studentId: string, teacherId: string, title: string, lessonPostId: string, exerciseId: string) {
  try {
    const info = await repo.autoSubmitNoticeInfo(studentId, teacherId);
    const link = `/bai-hoc/${lessonPostId}?tab=bai-tap&ex=${exerciseId}`;
    if (info.studentUserId) await notifyUsers([info.studentUserId], { title: "Bài kiểm tra bị nộp tự động do vi phạm", content: `Bài "${title}" đã được nộp tự động vì em vi phạm quy chế thi nhiều lần (thoát toàn màn hình, chuyển tab/ứng dụng...).`, type: "ASSIGNMENT", link });
    if (info.teacherUserId) await notifyUsers([info.teacherUserId], { title: "Học sinh bị nộp bài tự động do vi phạm", content: `${info.studentName} bị nộp tự động bài "${title}" do vi phạm quy chế thi. Mở bài tập để xem chi tiết các vi phạm.`, type: "ASSIGNMENT", link });
  } catch { /* không làm gián đoạn */ }
}

/** Giáo viên cho học sinh làm lại: xóa bài nộp (và các câu trả lời) của học sinh đó. */
export async function resetQuizSubmission(user: SessionUser, submissionId: string) {
  const sub = await repo.findSubmission(submissionId);
  if (!sub?.autoGraded) throw new ConflictError("Chỉ cho làm lại được bài trắc nghiệm");
  if (!(await canManageClassSubjectAssignment(user, sub.exercise.lessonPost.assignmentId))) throw new ForbiddenError("Không có quyền thao tác trên bài tập này");
  await repo.grantRetake(submissionId);
  return sub.exercise;
}

/** Mã bài học chứa bài tập / câu hỏi-trong-bài-tập: để làm mới đúng trang sau khi thao tác. */
export const lessonPostOfExercise = (exerciseId: string) => repo.findExercise(exerciseId).then((x) => x?.lessonPostId ?? null);
export const lessonPostOfExerciseQuestion = async (id: string) => {
  const eq = await repo.findExerciseQuestion(id);
  return eq ? lessonPostOfExercise(eq.exerciseId) : null;
};

/** Học sinh có được xem đáp án đúng của bài này chưa (theo cài đặt của giáo viên và số lượt làm còn lại). */
export function canRevealKey(ex: { showAnswers: string; dueDate: Date | null }, submitted: boolean, left = 0, now = new Date()) {
  return canRevealAnswers({ showAnswers: ex.showAnswers, dueDate: ex.dueDate, submitted, attemptsLeft: left, now });
}

/* ================= Chế độ thi nghiêm túc ================= */
export const VIOLATION_TYPES = ["EXIT_FULLSCREEN", "TAB_SWITCH", "WINDOW_BLUR", "MOUSE_LEAVE", "RELOAD"] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];
export const VIOLATION_LABEL: Record<string, string> = {
  EXIT_FULLSCREEN: "Thoát chế độ toàn màn hình", TAB_SWITCH: "Chuyển tab hoặc sang ứng dụng khác", WINDOW_BLUR: "Rời khỏi cửa sổ làm bài", MOUSE_LEAVE: "Đưa chuột ra ngoài màn hình thi", RELOAD: "Tải lại trang khi đang làm bài",
};
/** Hai lần báo cùng một loại trong khoảng này được tính là một (một thao tác thường kích hoạt nhiều sự kiện trình duyệt). */
export const VIOLATION_DEBOUNCE_MS = 1500;

/** Đã vượt số vi phạm cho phép chưa (max = 0: chỉ ghi nhận, không tự nộp). */
export const isOverLimit = (count: number, max: number) => max > 0 && count >= max;

/** Ghi nhận một vi phạm của học sinh đang làm bài thi nghiêm túc. Trả về số vi phạm hiện có và việc có phải tự nộp bài hay không. */
export async function reportViolation(user: SessionUser, exerciseId: string, type: string, detail?: string | null, answers: Record<string, unknown> = {}) {
  if (!user.studentId) throw new ForbiddenError("Chỉ học sinh mới ghi nhận được vi phạm");
  if (!(VIOLATION_TYPES as readonly string[]).includes(type)) throw new ConflictError("Loại vi phạm không hợp lệ");
  const ex = await repo.findExercise(exerciseId);
  if (!ex || !ex.quizMode || !ex.secureMode) throw new ConflictError("Bài tập không ở chế độ thi nghiêm túc");
  if (!(await repo.isStudentInClass(user.studentId, ex.lessonPost.assignment.schoolClassId))) throw new ForbiddenError("Bạn không thuộc lớp học của môn này");
  const active = await repo.findActiveAttempt(exerciseId, user.studentId);
  if (!active && (await repo.findStudentSubmission(exerciseId, user.studentId))) {
    // không có lượt đang làm (đã nộp rồi, ví dụ tự nộp do vi phạm): không ghi thêm
    return { count: await repo.countViolations(exerciseId, user.studentId), max: ex.maxViolations, exceeded: true };
  }
  if (!active) throw new ConflictError("Hãy bắt đầu lượt thi trước khi ghi nhận vi phạm");
  const last = await repo.lastViolation(exerciseId, user.studentId, type);
  if (!last || Date.now() - last.createdAt.getTime() >= VIOLATION_DEBOUNCE_MS) {
    await repo.createViolation({ exerciseId, studentId: user.studentId, type, detail: detail?.slice(0, 200) || null });
  }
  // giới hạn tính riêng cho từng lượt làm: chỉ đếm vi phạm từ lúc lượt này bắt đầu
  const count = await repo.countViolations(exerciseId, user.studentId, active?.startedAt);
  const exceeded = isOverLimit(count, ex.maxViolations);
  if (exceeded) await submitQuiz(user, exerciseId, answers, { autoSubmitted: true });
  return { count, max: ex.maxViolations, exceeded };
}

export const listExerciseViolations = (exerciseId: string) => repo.listViolations(exerciseId);
