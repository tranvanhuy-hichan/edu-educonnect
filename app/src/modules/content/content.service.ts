import { validateFileReferences } from "@/lib/storage/files";
import { createLessonPostSchema, createExerciseSchema, createSubmissionSchema } from "./content.schema";
import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import * as contentRepository from "@/modules/content/content.repository";
import { notifyUsers } from "@/modules/notification/notification.service";
import type {
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
  input = createLessonPostSchema.parse(input);
  await assertCanManageAssignment(user, input.assignmentId);
  if (!input.content.trim() && !input.attachments?.length) throw new Error("Nhập nội dung hoặc tải tệp bài học");
  await validateFileReferences(user, input.attachments ?? [], input.assignmentId, "LESSON_POST");
  return contentRepository.createLessonPost(input);
}

/** Đăng cùng một bài học cho nhiều lớp (cùng môn, cùng học kỳ): mỗi lớp một bài học riêng để theo dõi xem/nộp bài độc lập. */
export async function createLessonPosts(user: SessionUser, input: Omit<CreateLessonPostInput, "assignmentId"> & { assignmentIds: string[] }) {
  const ids = [...new Set(input.assignmentIds)];
  if (!ids.length) throw new Error("Chọn ít nhất một lớp để đăng bài");
  const targets = await contentRepository.findAssignments(ids);
  if (targets.length !== ids.length) throw new ForbiddenError("Lớp-môn không tồn tại");
  if (new Set(targets.map((t) => `${t.subjectId}|${t.academicTermId}`)).size > 1) throw new Error("Chỉ đăng cùng lúc cho các lớp cùng môn, cùng học kỳ");
  const { assignmentIds: _omit, ...rest } = input;
  void _omit;
  const parsed = ids.map((assignmentId) => createLessonPostSchema.parse({ ...rest, assignmentId }));
  for (const p of parsed) {
    await assertCanManageAssignment(user, p.assignmentId);
    if (!p.content.trim() && !p.attachments?.length) throw new Error("Nhập nội dung hoặc tải tệp bài học");
    await validateFileReferences(user, p.attachments ?? [], p.assignmentId, "LESSON_POST");
  }
  return contentRepository.createLessonPosts(parsed);
}

/** Thêm bài tập vào một bài học (quyền theo lớp và môn của bài học) và thông báo cho học sinh. */
export async function createExercise(user: SessionUser, input: CreateExerciseInput) {
  input = createExerciseSchema.parse(input);
  const post = await contentRepository.findLessonPost(input.lessonPostId);
  if (!post) throw new ForbiddenError("Bài học không tồn tại");
  await assertCanManageAssignment(user, post.assignmentId);
  if (!input.quizMode && !input.content.trim() && !input.attachments?.length) throw new Error("Nhập đề bài hoặc tải tệp bài tập");
  await validateFileReferences(user, input.attachments ?? [], post.assignmentId, "EXERCISE");
  const ex = await contentRepository.createExercise(input);

  // Gửi thông báo đến học sinh trong lớp
  try {
    const assignment = await contentRepository.notificationRecipients(post.assignmentId);
    if (assignment) {
      const userIds = assignment.schoolClass.enrollments
        .map((e) => e.student.userId)
        .filter(Boolean);
      await notifyUsers(userIds, {
        title: `Bài tập mới: ${ex.title}`,
        content: `Môn ${assignment.subject.subjectName} vừa giao bài tập mới trong bài học "${post.title}". Hạn nộp: ${ex.dueDate ? new Date(ex.dueDate).toLocaleDateString("vi-VN") : "Không có hạn"}.`,
        type: "ASSIGNMENT",
        link: `/bai-hoc/${post.id}?tab=bai-tap&ex=${ex.id}`,
      });
    }
  } catch {
    // Không làm gián đoạn nếu gửi thông báo lỗi
  }

  return ex;
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

/** Học sinh nộp bài tự luận (quizMode=false): cho phép nộp lại nếu giáo viên chưa chấm điểm; kiểm tra hạn nộp để ghi nhận nộp muộn. */
export async function submitAssignment(
  user: SessionUser,
  exerciseId: string,
  content: string,
  attachments: string[] = [],
) {
  if (!user.studentId) {
    throw new ForbiddenError("Chỉ học sinh mới được nộp bài");
  }

  const exercise = await contentRepository.findExercise(exerciseId);
  if (!exercise) {
    throw new ForbiddenError("Bài tập không tồn tại");
  }
  await assertCanAccessAsStudent(user, exercise.lessonPost.assignmentId);
  if (exercise.quizMode) throw new ConflictError("Đây là bài trắc nghiệm, hãy làm bài trong trang bài tập");

  ({ content, attachments } = createSubmissionSchema.parse({ content, attachments }));
  await validateFileReferences(user, attachments, exercise.lessonPost.assignmentId, "SUBMISSION", exerciseId);
  const now = new Date();
  const isLate = Boolean(exercise.dueDate && now > exercise.dueDate);

  const existing = await contentRepository.findSubmission(
    exerciseId,
    user.studentId,
  );

  if (existing) {
    if (existing.grade !== null) {
      throw new ConflictError("Bài tập đã được giáo viên chấm điểm, không thể nộp lại");
    }
    return contentRepository.updateSubmission(existing.id, {
      content,
      attachments,
      submittedAt: now,
      isLate,
      resubmittedCount: (existing.resubmittedCount ?? 0) + 1,
    });
  }

  return contentRepository.createSubmission({
    exerciseId,
    studentId: user.studentId,
    content,
    attachments,
    isLate,
    submittedAt: now,
  });
}

/** GVBM chấm điểm/nhận xét bài tự luận bằng tay. */
export async function gradeSubmission(
  user: SessionUser,
  submissionId: string,
  grade: number,
  feedback?: string,
) {
  if (!Number.isFinite(grade) || grade < 0 || grade > 10) throw new ConflictError("Điểm phải từ 0 đến 10");
  const submission = await contentRepository.findSubmissionById(submissionId);
  if (!submission) {
    throw new ForbiddenError("Bài nộp không tồn tại");
  }
  await assertCanManageAssignment(
    user,
    submission.exercise.lessonPost.assignmentId,
  );
  if (submission.autoGraded) throw new ConflictError("Bài trắc nghiệm được chấm tự động");

  return contentRepository.gradeSubmission(submissionId, grade, feedback);
}

export async function updateLessonPost(user: SessionUser, id: string, data: { title: string; content: string; attachments: string[] }) {
  const post = await contentRepository.findLessonPost(id);
  if (!post) throw new ConflictError("Bài học không tồn tại");
  await assertCanManageAssignment(user, post.assignmentId);
  const parsed = createLessonPostSchema.parse({ ...data, assignmentId: post.assignmentId });
  if (!parsed.content.trim() && !parsed.attachments?.length) throw new ConflictError("Nhập nội dung hoặc tải tệp bài học");
  await validateFileReferences(user, parsed.attachments ?? [], post.assignmentId, "LESSON_POST");
  return contentRepository.updateLessonPost(id, { title: parsed.title, content: parsed.content, attachments: parsed.attachments ?? [] });
}
export async function deleteLessonPost(user: SessionUser, id: string) {
  const post = await contentRepository.findLessonPost(id);
  if (!post) throw new ConflictError("Bài học không tồn tại");
  await assertCanManageAssignment(user, post.assignmentId);
  await contentRepository.deleteLessonPost(id);
  return post;
}
export async function updateExercise(user: SessionUser, id: string, data: { title: string; content: string; attachments: string[]; dueDate: Date | null; showAnswers?: string; secureMode?: boolean; maxViolations?: number }) {
  const exercise = await contentRepository.findExercise(id);
  if (!exercise) throw new ConflictError("Bài tập không tồn tại");
  await assertCanManageAssignment(user, exercise.lessonPost.assignmentId);
  const parsed = createExerciseSchema.parse({ ...data, dueDate: data.dueDate ?? undefined, lessonPostId: exercise.lessonPostId, quizMode: exercise.quizMode });
  if (!exercise.quizMode && !parsed.content.trim() && !parsed.attachments?.length) throw new ConflictError("Nhập đề bài hoặc tải tệp bài tập");
  await validateFileReferences(user, parsed.attachments ?? [], exercise.lessonPost.assignmentId, "EXERCISE");
  return contentRepository.updateExercise(id, { title: parsed.title, content: parsed.content, attachments: parsed.attachments ?? [], dueDate: parsed.dueDate ?? null, showAnswers: parsed.showAnswers, secureMode: exercise.quizMode ? parsed.secureMode : undefined, maxViolations: parsed.maxViolations });
}
export async function deleteExercise(user: SessionUser, id: string) {
  const exercise = await contentRepository.findExercise(id);
  if (!exercise) throw new ConflictError("Bài tập không tồn tại");
  await assertCanManageAssignment(user, exercise.lessonPost.assignmentId);
  await contentRepository.deleteExercise(id);
  return exercise;
}
