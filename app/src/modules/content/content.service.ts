import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { ConflictError, ForbiddenError } from "@/modules/academic/academic.service";
import * as contentRepository from "@/modules/content/content.repository";
import type {
  CreateLessonPlanInput,
  CreateExerciseInput,
  CreateLessonPostInput,
} from "@/modules/content/content.schema";

async function assertCanManageAssignment(
  user: SessionUser,
  assignmentId: string,
) {
  const allowed = await canManageClassSubjectAssignment(user, assignmentId);
  if (!allowed) {
    throw new ForbiddenError("Không có quyền thao tác trên môn học này");
  }
}

async function assertCanAccessAsStudent(
  user: SessionUser,
  assignmentId: string,
) {
  if (isAdmin(user)) return;
  if (!user.studentId) {
    throw new ForbiddenError("Chỉ học sinh mới xem/nộp được bài tập");
  }
  const inClass = await contentRepository.isStudentInAssignmentClass(
    user.studentId,
    assignmentId,
  );
  if (!inClass) {
    throw new ForbiddenError("Bạn không thuộc lớp học của môn này");
  }
}

export async function createLessonPost(
  user: SessionUser,
  input: CreateLessonPostInput,
) {
  await assertCanManageAssignment(user, input.assignmentId);
  return contentRepository.createLessonPost(input);
}

/** Thêm bài tập vào một bài học (quyền theo lớp-môn của bài học). */
export async function createExercise(user: SessionUser, input: CreateExerciseInput) {
  const post = await contentRepository.findLessonPost(input.lessonPostId);
  if (!post) throw new ForbiddenError("Bài học không tồn tại");
  await assertCanManageAssignment(user, post.assignmentId);
  return contentRepository.createExercise(input);
}

export async function listLessonPosts(
  user: SessionUser,
  assignmentId: string,
) {
  if (user.studentId) {
    await assertCanAccessAsStudent(user, assignmentId);
  } else {
    await assertCanManageAssignment(user, assignmentId);
  }
  return contentRepository.listLessonPostsByAssignment(assignmentId);
}

/** Học sinh xem bài -> tự động ghi nhận LessonPostView (nguồn sự thật "đã xem", không chỉ đếm lượt). */
export async function viewLessonPost(user: SessionUser, lessonPostId: string) {
  if (!user.studentId) {
    throw new ForbiddenError("Chỉ học sinh mới được ghi nhận xem bài");
  }

  const post = await contentRepository.findLessonPost(lessonPostId);
  if (!post) {
    throw new ForbiddenError("Bài học không tồn tại");
  }

  await assertCanAccessAsStudent(user, post.assignmentId);
  return contentRepository.recordLessonPostView(lessonPostId, user.studentId);
}

export async function listLessonPostViews(
  user: SessionUser,
  lessonPostId: string,
) {
  const post = await contentRepository.findLessonPost(lessonPostId);
  if (!post) {
    throw new ForbiddenError("Bài học không tồn tại");
  }
  await assertCanManageAssignment(user, post.assignmentId);
  return contentRepository.listViewsByLessonPost(lessonPostId);
}

export async function createLessonPlan(
  user: SessionUser,
  input: CreateLessonPlanInput,
) {
  await assertCanManageAssignment(user, input.assignmentId);
  return contentRepository.createLessonPlan(input);
}

export async function listLessonPlans(
  user: SessionUser,
  assignmentId: string,
) {
  if (user.studentId) {
    await assertCanAccessAsStudent(user, assignmentId);
  } else {
    await assertCanManageAssignment(user, assignmentId);
  }
  return contentRepository.listLessonPlansByAssignment(assignmentId);
}

/** Học sinh nộp bài tự luận (quizMode=false): 1 học sinh chỉ nộp 1 lần/bài tập (unique exerciseId+studentId). */
export async function submitAssignment(
  user: SessionUser,
  exerciseId: string,
  content: string,
) {
  if (!user.studentId) {
    throw new ForbiddenError("Chỉ học sinh mới được nộp bài");
  }

  const exercise = await contentRepository.findExercise(exerciseId);
  if (!exercise) {
    throw new ForbiddenError("Bài tập không tồn tại");
  }
  await assertCanAccessAsStudent(user, exercise.lessonPost.assignmentId);

  const existing = await contentRepository.findSubmission(
    exerciseId,
    user.studentId,
  );
  if (existing) {
    throw new ConflictError("Bạn đã nộp bài này rồi");
  }

  return contentRepository.createSubmission(
    exerciseId,
    user.studentId,
    content,
  );
}

/** GVBM chấm điểm/nhận xét bài tự luận bằng tay. */
export async function gradeSubmission(
  user: SessionUser,
  submissionId: string,
  grade: number,
  feedback?: string,
) {
  const submission = await contentRepository.findSubmissionById(submissionId);
  if (!submission) {
    throw new ForbiddenError("Bài nộp không tồn tại");
  }
  await assertCanManageAssignment(
    user,
    submission.exercise.lessonPost.assignmentId,
  );

  return contentRepository.gradeSubmission(submissionId, grade, feedback);
}
