import { prisma } from "@/lib/prisma";
import type {
  CreateLessonPlanInput,
  CreateExerciseInput,
  CreateLessonPostInput,
} from "@/modules/content/content.schema";

export function createLessonPost(input: CreateLessonPostInput) {
  return prisma.lessonPost.create({ data: input });
}

export function createExercise(input: CreateExerciseInput) {
  return prisma.exercise.create({ data: input });
}

export function findExercise(exerciseId: string) {
  return prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { lessonPost: { include: { assignment: true } } },
  });
}

export function listLessonPostsByAssignment(assignmentId: string) {
  return prisma.lessonPost.findMany({
    where: { assignmentId },
    orderBy: { createdAt: "desc" },
  });
}

export function findLessonPost(lessonPostId: string) {
  return prisma.lessonPost.findUnique({
    where: { id: lessonPostId },
    include: { assignment: true },
  });
}

/** Ghi nhận học sinh đã xem — idempotent, không tạo bản ghi trùng (unique lessonPostId+studentId). */
export function recordLessonPostView(lessonPostId: string, studentId: string) {
  return prisma.lessonPostView.upsert({
    where: { lessonPostId_studentId: { lessonPostId, studentId } },
    update: {},
    create: { lessonPostId, studentId },
  });
}

export function listViewsByLessonPost(lessonPostId: string) {
  return prisma.lessonPostView.findMany({
    where: { lessonPostId },
    include: { student: true },
  });
}

export function createLessonPlan(input: CreateLessonPlanInput) {
  return prisma.lessonPlan.create({ data: input });
}

export function listLessonPlansByAssignment(assignmentId: string) {
  return prisma.lessonPlan.findMany({
    where: { assignmentId },
    orderBy: { publishedAt: "desc" },
  });
}

/** Kiểm tra học sinh có thuộc lớp của assignment hay không (để xem bài/nộp bài). */
export function isStudentInAssignmentClass(
  studentId: string,
  assignmentId: string,
) {
  return prisma.classSubjectAssignment
    .findUnique({ where: { id: assignmentId }, select: { schoolClassId: true } })
    .then((assignment) => {
      if (!assignment) return false;
      return prisma.studentClassEnrollment
        .findFirst({
          where: { studentId, schoolClassId: assignment.schoolClassId },
          select: { id: true },
        })
        .then((enrollment) => enrollment !== null);
    });
}

export function createSubmission(data: {
  exerciseId: string;
  studentId: string;
  content: string;
  isLate?: boolean;
  submittedAt?: Date;
}) {
  return prisma.assignmentSubmission.create({
    data: {
      exerciseId: data.exerciseId,
      studentId: data.studentId,
      content: data.content,
      isLate: data.isLate ?? false,
      submittedAt: data.submittedAt ?? new Date(),
    },
  });
}

export function updateSubmission(
  id: string,
  data: {
    content: string;
    submittedAt: Date;
    isLate: boolean;
    resubmittedCount: number;
  },
) {
  return prisma.assignmentSubmission.update({
    where: { id },
    data,
  });
}

export function findSubmission(exerciseId: string, studentId: string) {
  return prisma.assignmentSubmission.findUnique({
    where: { exerciseId_studentId: { exerciseId, studentId } },
  });
}

export function gradeSubmission(
  submissionId: string,
  grade: number,
  feedback?: string,
) {
  return prisma.assignmentSubmission.update({
    where: { id: submissionId },
    data: { grade, feedback },
  });
}

export function findSubmissionById(submissionId: string) {
  return prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: { exercise: { include: { lessonPost: { include: { assignment: true } } } } },
  });
}
