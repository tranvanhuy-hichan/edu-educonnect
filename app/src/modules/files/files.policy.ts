import * as repository from "./files.repository";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import type { SessionUser } from "@/lib/auth/session";
import { FILE_PATH } from "@/lib/storage/validation";

export const FILE_PURPOSES = ["LESSON_PLAN", "LESSON_POST", "EXERCISE", "SUBMISSION"] as const;
export type FilePurpose = typeof FILE_PURPOSES[number];
export class FileAccessError extends Error {}
export async function requireUploadAccess(user: SessionUser, assignmentId: string, purpose: string, exerciseId: string | null = null) {
  if (!FILE_PURPOSES.includes(purpose as FilePurpose)) throw new FileAccessError("Loại tài liệu không hợp lệ");
  if (purpose !== "SUBMISSION") {
    if (!await canManageClassSubjectAssignment(user, assignmentId)) throw new FileAccessError("Không có quyền tải tệp cho lớp và môn này");
    // Quản lý cũng phải cung cấp assignment tồn tại.
    if (!await repository.findAssignment(assignmentId)) throw new FileAccessError("Lớp-môn không tồn tại");
    return;
  }
  if (!user.studentId || !user.roles.includes("STUDENT") || !exerciseId) throw new FileAccessError("Chỉ học sinh được tải bài nộp của mình");
  const exercise = await repository.findExercise(exerciseId);
  if (!exercise || exercise.quizMode || exercise.lessonPost.assignmentId !== assignmentId) throw new FileAccessError("Bài tập không phù hợp");
  const assignment = exercise.lessonPost.assignment;
  const enrollment = await repository.findEnrollment(user.studentId, assignment.academicTerm.academicYearId);
  if (!enrollment || enrollment.schoolClassId !== assignment.schoolClassId) throw new FileAccessError("Bạn không thuộc lớp của bài tập");
  const submission = await repository.findSubmission(exerciseId, user.studentId);
  if (submission?.grade != null) throw new FileAccessError("Bài đã chấm, không thể thay tệp bài nộp");
}
export async function validateFileReferences(user: SessionUser, urls: string[], assignmentId: string, purpose: FilePurpose, exerciseId?: string) {
  const paths = urls.filter((url) => FILE_PATH.test(url));
  if (!paths.length) return;
  const files = await repository.findFiles(paths.map((path) => path.split("/").pop()!));
  if (files.length !== paths.length) throw new FileAccessError("Tệp không thuộc đúng lớp và môn hoặc bài làm đang lưu");
  // Một bài học có thể đăng cho nhiều lớp: tệp do chính người dùng tải lên ở lớp khác vẫn dùng được nếu họ quản lý lớp và môn đích.
  const sharedPost = purpose === "LESSON_POST" && files.some((file) => file.assignmentId !== assignmentId) && await canManageClassSubjectAssignment(user, assignmentId);
  if (files.some((file) => file.purpose !== purpose || (file.assignmentId !== assignmentId && !(sharedPost && file.uploadedBy === user.userId)) || (purpose === "SUBMISSION" && (file.uploadedBy !== user.userId || file.exerciseId !== exerciseId)))) throw new FileAccessError("Tệp không thuộc đúng lớp và môn hoặc bài làm đang lưu");
}
export async function canDownloadFile(user: SessionUser, file: { id: string; uploadedBy: string; assignmentId: string; purpose: string }) {
  if (file.uploadedBy === user.userId) return true;
  if (await canManageClassSubjectAssignment(user, file.assignmentId)) return true;
  if (!user.studentId || !user.roles.includes("STUDENT") || !["LESSON_PLAN", "LESSON_POST", "EXERCISE"].includes(file.purpose)) return false;
  if (file.purpose === "LESSON_POST") return repository.isLessonPostFileVisibleToStudent(user.studentId, `/api/files/${file.id}`);
  const assignment = await repository.findAssignment(file.assignmentId);
  if (!assignment) return false;
  const enrollment = await repository.findEnrollment(user.studentId, assignment.academicTerm.academicYearId);
  if (enrollment?.schoolClassId !== assignment.schoolClassId) return false;
  const path = `/api/files/${file.id}`;
  return repository.isFilePublished(assignment.id, file.purpose, path);
}
