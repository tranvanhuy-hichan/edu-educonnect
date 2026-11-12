import type { SessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/session";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import { gradeQuestion, toGrade10 } from "./question.grading";
import * as repo from "./quiz.repository";

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

/** Học sinh nộp bài trắc nghiệm: chấm tự động từng câu, lưu điểm từng câu và điểm hệ 10 của cả bài. Mỗi học sinh làm một lần. */
export async function submitQuiz(user: SessionUser, exerciseId: string, answers: Record<string, unknown>, opts: { autoSubmitted?: boolean } = {}) {
  if (!user.studentId) throw new ForbiddenError("Chỉ học sinh mới được nộp bài");
  const ex = await repo.findExerciseForGrading(exerciseId);
  if (!ex || !ex.quizMode) throw new ForbiddenError("Bài tập không tồn tại");
  if (!(await repo.isStudentInClass(user.studentId, ex.lessonPost.assignment.schoolClassId))) throw new ForbiddenError("Bạn không thuộc lớp học của môn này");
  if (!ex.questions.length) throw new ConflictError("Bài tập chưa có câu hỏi");

  const now = new Date();
  const graded = ex.questions.map((eq) => ({ eq, ...gradeQuestion(eq.question, answers[eq.questionId], eq.points) }));
  const earned = graded.reduce((s, g) => s + g.score, 0);
  const max = ex.questions.reduce((s, eq) => s + eq.points, 0);
  try {
    return await repo.createGradedSubmission({
      exerciseId, studentId: user.studentId, submittedAt: now, isLate: Boolean(ex.dueDate && now > ex.dueDate), grade: toGrade10(earned, max), autoSubmitted: opts.autoSubmitted === true,
      answers: graded.map((g) => ({ questionId: g.eq.questionId, answer: answers[g.eq.questionId], score: g.score, maxScore: g.eq.points, isCorrect: g.isCorrect })),
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ConflictError("Bạn đã nộp bài tập này rồi");
    throw e;
  }
}

/** Giáo viên cho học sinh làm lại: xóa bài nộp (và các câu trả lời) của học sinh đó. */
export async function resetQuizSubmission(user: SessionUser, submissionId: string) {
  const sub = await repo.findSubmission(submissionId);
  if (!sub?.autoGraded) throw new ConflictError("Chỉ cho làm lại được bài trắc nghiệm");
  if (!(await canManageClassSubjectAssignment(user, sub.exercise.lessonPost.assignmentId))) throw new ForbiddenError("Không có quyền thao tác trên bài tập này");
  await repo.deleteSubmission(submissionId);
  return sub.exercise;
}

/** Mã bài học chứa bài tập / câu hỏi-trong-bài-tập: để làm mới đúng trang sau khi thao tác. */
export const lessonPostOfExercise = (exerciseId: string) => repo.findExercise(exerciseId).then((x) => x?.lessonPostId ?? null);
export const lessonPostOfExerciseQuestion = async (id: string) => {
  const eq = await repo.findExerciseQuestion(id);
  return eq ? lessonPostOfExercise(eq.exerciseId) : null;
};

/** Học sinh có được xem đáp án đúng của bài này chưa (theo cài đặt của giáo viên). */
export function canRevealKey(ex: { showAnswers: string; dueDate: Date | null }, submitted: boolean, now = new Date()) {
  if (!submitted || ex.showAnswers === "NEVER") return false;
  if (ex.showAnswers === "AFTER_SUBMIT") return true;
  return !ex.dueDate || now > new Date(ex.dueDate.getTime() + 86400_000); // hết ngày hạn nộp
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
export async function reportViolation(user: SessionUser, exerciseId: string, type: string, detail?: string | null) {
  if (!user.studentId) throw new ForbiddenError("Chỉ học sinh mới ghi nhận được vi phạm");
  if (!(VIOLATION_TYPES as readonly string[]).includes(type)) throw new ConflictError("Loại vi phạm không hợp lệ");
  const ex = await repo.findExercise(exerciseId);
  if (!ex || !ex.quizMode || !ex.secureMode) throw new ConflictError("Bài tập không ở chế độ thi nghiêm túc");
  if (!(await repo.isStudentInClass(user.studentId, ex.lessonPost.assignment.schoolClassId))) throw new ForbiddenError("Bạn không thuộc lớp học của môn này");
  if (await repo.findStudentSubmission(exerciseId, user.studentId)) {
    // đã nộp rồi (ví dụ tự nộp do vi phạm): không ghi thêm
    return { count: await repo.countViolations(exerciseId, user.studentId), max: ex.maxViolations, exceeded: true };
  }
  const last = await repo.lastViolation(exerciseId, user.studentId, type);
  if (!last || Date.now() - last.createdAt.getTime() >= VIOLATION_DEBOUNCE_MS) {
    await repo.createViolation({ exerciseId, studentId: user.studentId, type, detail: detail?.slice(0, 200) || null });
  }
  const count = await repo.countViolations(exerciseId, user.studentId);
  return { count, max: ex.maxViolations, exceeded: isOverLimit(count, ex.maxViolations) };
}

export const listExerciseViolations = (exerciseId: string) => repo.listViolations(exerciseId);
