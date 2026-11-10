import type { DatabaseContext } from "@/infrastructure/database/unit-of-work";
import { gradingRepository } from "./scoring.repository";
import type { SessionUser } from "@/lib/auth/session";

export function termIsLocked(term: { isLocked: boolean; endDate: Date }, now = new Date()) {
  return term.isLocked || now.getTime() > term.endDate.getTime() + 15 * 86400000;
}
export async function activeUnlock(user: SessionUser, assignmentId: string, context?: DatabaseContext) {
  return gradingRepository(context).activeUnlock(user.userId, assignmentId, new Date());
}
export async function assertScoreWrite(user: SessionUser, assignmentId: string, context: DatabaseContext) {
  const repository = gradingRepository(context);
  const assignment = await repository.assignment(assignmentId);
  await repository.lockTermRow(assignment.academicTermId);
  const term = await repository.term(assignment.academicTermId);
  if (termIsLocked(term) && !await activeUnlock(user, assignmentId, context)) throw new Error("Sổ điểm đã khóa. Cần yêu cầu và phê duyệt mở quyền sửa đúng lớp-môn, có thời hạn; quản lý cũng không được sửa trực tiếp.");
  return assignment;
}
