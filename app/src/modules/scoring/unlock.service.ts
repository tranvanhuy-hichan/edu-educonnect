import { z } from "zod";
import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { ForbiddenError } from "@/shared/errors";
import { withTransaction } from "@/infrastructure/database/unit-of-work";
import { appendAudit } from "@/modules/academic/records.repository";
import { gradingRepository } from "./scoring.repository";
import { termIsLocked } from "./locking";
const requestSchema = z.object({ assignmentId: z.string().min(1), reason: z.string().min(10).max(2000), durationHours: z.number().int().min(1).max(72) });
const reviewSchema = z.object({ requestId: z.string().min(1), reason: z.string().min(10).max(2000), approve: z.boolean() });
export async function requestScoreUnlock(user: SessionUser, input: z.infer<typeof requestSchema>) {
  const data = requestSchema.parse(input);
  if (!await canManageClassSubjectAssignment(user, data.assignmentId)) throw new ForbiddenError("Không có quyền với lớp và môn này");
  return withTransaction(async (context) => {
    const repository = gradingRepository(context);
    const assignment = await repository.assignment(data.assignmentId);
    await repository.lockTermRow(assignment.academicTermId);
    if (!termIsLocked(await repository.term(assignment.academicTermId))) throw new Error("Sổ điểm chưa khóa");
    if (await repository.pendingUnlock(user.userId, data.assignmentId)) throw new Error("Bạn đã có yêu cầu đang chờ duyệt");
    const result = await repository.createUnlock({ ...data, academicTermId: assignment.academicTermId, requestedBy: user.userId, requesterEmail: user.email });
    await appendAudit({ actorEmail: user.email, action: "request_score_unlock", targetType: "ScoreUnlockRequest", targetId: result.id, reason: data.reason }, context);
    return result;
  });
}
export async function reviewScoreUnlock(user: SessionUser, input: z.infer<typeof reviewSchema>) {
  if (!isAdmin(user)) throw new ForbiddenError();
  const data = reviewSchema.parse(input);
  return withTransaction(async (context) => {
    const repository = gradingRepository(context);
    await repository.lockUnlockRequest(data.requestId);
    const previous = await repository.unlockRequest(data.requestId);
    if (previous.status !== "SUBMITTED") throw new Error("Yêu cầu đã được xử lý");
    if (previous.requestedBy === user.userId) throw new Error("Không được tự duyệt yêu cầu của chính mình; cần một quản lý khác");
    const now = new Date();
    const result = await repository.reviewUnlock(previous.id, { status: data.approve ? "APPROVED" : "REJECTED", reviewedBy: user.email, reviewReason: data.reason, approvedAt: data.approve ? now : null, expiresAt: data.approve ? new Date(now.getTime() + previous.durationHours * 3600000) : null });
    await appendAudit({ actorEmail: user.email, action: data.approve ? "approve_score_unlock" : "reject_score_unlock", targetType: "ScoreUnlockRequest", targetId: previous.id, reason: data.reason, beforeData: JSON.parse(JSON.stringify(previous)), afterData: JSON.parse(JSON.stringify(result)) }, context);
    return result;
  });
}
export async function lockGradebook(user: SessionUser, termId: string) {
  if (!isAdmin(user)) throw new ForbiddenError();
  return withTransaction(async (context) => {
    const repository = gradingRepository(context), now = new Date();
    await repository.lockTermRow(termId);
    const result = await repository.lockTerm(termId, user.email, now);
    await repository.expireUnlocks(termId, now);
    await appendAudit({ actorEmail: user.email, action: "lock_term", targetType: "AcademicTerm", targetId: termId }, context);
    return result;
  });
}
