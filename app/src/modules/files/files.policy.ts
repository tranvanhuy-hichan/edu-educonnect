import * as repository from "./files.repository";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { FILE_PATH } from "@/lib/storage/validation";

export const FILE_PURPOSES = ["LESSON_POST", "EXERCISE", "SUBMISSION", "QUESTION", "LIBRARY", "IMPORT"] as const;
export type FilePurpose = typeof FILE_PURPOSES[number];
export class FileAccessError extends Error {}
/** Tệp của giáo viên không gắn với lớp-môn nào: ảnh câu hỏi, tệp bài học trong kho, tệp đề nhập cho AI. */
export const PERSONAL_PURPOSES: readonly string[] = ["QUESTION", "LIBRARY", "IMPORT"];
export async function requireUploadAccess(user: SessionUser, assignmentId: string, purpose: string, exerciseId: string | null = null) {
  if (!FILE_PURPOSES.includes(purpose as FilePurpose)) throw new FileAccessError("Loại tài liệu không hợp lệ");
  // Ảnh câu hỏi thuộc ngân hàng câu hỏi của giáo viên, không gắn với lớp-môn nào.
  if (PERSONAL_PURPOSES.includes(purpose)) {
    if (!user.teacherId) throw new FileAccessError("Chỉ giáo viên mới tải được tệp này");
    return;
  }
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
  if (PERSONAL_PURPOSES.includes(purpose)) {
    if (files.length !== new Set(paths).size || files.some((file) => file.purpose !== purpose || file.uploadedBy !== user.userId)) throw new FileAccessError("Tệp không hợp lệ hoặc không phải do bạn tải lên");
    return;
  }
  if (files.length !== paths.length) throw new FileAccessError("Tệp không thuộc đúng lớp và môn hoặc bài làm đang lưu");
  // Một bài học có thể đăng cho nhiều lớp: tệp do chính người dùng tải lên ở lớp khác vẫn dùng được nếu họ quản lý lớp và môn đích.
  const sharedPost = purpose === "LESSON_POST" && files.some((file) => file.assignmentId !== assignmentId) && await canManageClassSubjectAssignment(user, assignmentId);
  if (files.some((file) => file.purpose !== purpose || (file.assignmentId !== assignmentId && !(sharedPost && file.uploadedBy === user.userId)) || (purpose === "SUBMISSION" && (file.uploadedBy !== user.userId || file.exerciseId !== exerciseId)))) throw new FileAccessError("Tệp không thuộc đúng lớp và môn hoặc bài làm đang lưu");
}
export async function canDownloadFile(user: SessionUser, file: { id: string; uploadedBy: string; assignmentId: string | null; purpose: string }) {
  if (file.uploadedBy === user.userId) return true;
  if (file.purpose === "QUESTION") {
    if (isAdmin(user)) return true;
    return !!user.studentId && user.roles.includes("STUDENT") && repository.isQuestionImageVisibleToStudent(user.studentId, `/api/files/${file.id}`);
  }
  if (file.purpose === "IMPORT") return false;
  if (file.purpose === "LIBRARY") {
    // tệp của bài học/bài tập trong kho: học sinh chỉ xem được khi nó đã được đăng cho lớp của mình
    if (isAdmin(user)) return true;
    if (!user.studentId || !user.roles.includes("STUDENT")) return false;
    const path = `/api/files/${file.id}`;
    return (await repository.isLessonPostFileVisibleToStudent(user.studentId, path)) || (await repository.isExerciseFileVisibleToStudent(user.studentId, path));
  }
  if (!file.assignmentId) return false;
  if (await canManageClassSubjectAssignment(user, file.assignmentId)) return true;
  if (!user.studentId || !user.roles.includes("STUDENT") || !["LESSON_POST", "EXERCISE"].includes(file.purpose)) return false;
  if (file.purpose === "LESSON_POST") return repository.isLessonPostFileVisibleToStudent(user.studentId, `/api/files/${file.id}`);
  const assignment = await repository.findAssignment(file.assignmentId);
  if (!assignment) return false;
  const enrollment = await repository.findEnrollment(user.studentId, assignment.academicTerm.academicYearId);
  if (enrollment?.schoolClassId !== assignment.schoolClassId) return false;
  const path = `/api/files/${file.id}`;
  return repository.isFilePublished(assignment.id, file.purpose, path);
}
