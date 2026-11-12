import { z } from "zod";
import type { SessionUser } from "@/lib/auth/session";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { withTransaction } from "@/infrastructure/database/unit-of-work";
import * as records from "@/modules/academic/records.repository";
import { yearResultRepository } from "@/modules/promotion/promotion.repository";
import { gradingRepository } from "./scoring.repository";
import { assertScoreWrite } from "./locking";
import { roundGrade } from "./annual";
import { notifyScoresChanged, scoresDiffer, type ScoreSet } from "@/modules/notification/guardian-events";
const score = z.number().min(0).max(10);
export const saveScoresInput = z.object({ assignmentId: z.string().min(1), reason: z.string().min(5), rows: z.array(z.object({ studentId: z.string().min(1), tx: z.array(score).max(20), gk: score.nullable(), ck: score.nullable() })).min(1).max(100) });
export async function saveClassScores(me: SessionUser, input: z.infer<typeof saveScoresInput>) {
  const { assignmentId, rows, reason } = saveScoresInput.parse(input);
  const a = await gradingRepository().assignment(assignmentId);
  if (!(await canManageClassSubjectAssignment(me, assignmentId))) throw new Error("Bạn không phụ trách lớp và môn này");

  if (a.subject.assessmentType !== "SCORE") throw new Error("Môn này đánh giá bằng nhận xét, không nhập điểm số");
  if (new Set(rows.map((row) => row.studentId)).size !== rows.length) throw new Error("Học sinh bị lặp");
  if (reason.length < 5) throw new Error("Nhập lý do cập nhật điểm (ít nhất 5 ký tự)");
  const changes: { studentId: string; after: ScoreSet }[] = [];
  await withTransaction(async (tx) => {
    changes.length = 0; // giao dịch có thể được thử lại
    const assignment = await assertScoreWrite(me, assignmentId, tx);
    const enrolled = new Set((await records.listClassStudentIds(a.schoolClassId, a.schoolClass.academicYearId, tx)).map((row) => row.studentId));
    for (const row of rows) {
      if (!enrolled.has(row.studentId)) throw new Error("Học sinh không thuộc lớp và môn được chọn");
      await records.lockStudentYear(row.studentId, a.schoolClass.academicYearId, tx);
      if ((await yearResultRepository(tx).find(row.studentId, a.schoolClass.academicYearId))?.reviewStatus === "APPROVED") throw new Error("Kết quả năm học đã duyệt; cần mở lại hồ sơ kết quả trước khi sửa điểm");
      if ((await gradingRepository(tx).assessment(row.studentId, assignmentId))?.isExempt) throw new Error("Học sinh đã có quyết định miễn đánh giá môn này; không sửa điểm số");
      const key = { studentId: row.studentId, assignmentId, academicTermId: assignment.academicTermId };
      const before = await gradingRepository(tx).entries(row.studentId, assignmentId, assignment.academicTermId);
      const base = Date.now();
      const data = [
        ...row.tx.map((value, i) => ({ scoreType: "THUONG_XUYEN" as const, value, createdAt: new Date(base + i) })),
        ...(row.gk != null ? [{ scoreType: "GIUA_KY" as const, value: row.gk, createdAt: new Date(base + 100) }] : []),
        ...(row.ck != null ? [{ scoreType: "CUOI_KY" as const, value: row.ck, createdAt: new Date(base + 101) }] : []),
      ].map((entry) => ({ ...entry, ...key }));
      await gradingRepository(tx).removeEntries(row.studentId, assignmentId, assignment.academicTermId);
      if (data.length) {
        await gradingRepository(tx).insertEntries(data);
        const denominator = row.tx.length + (row.gk == null ? 0 : 2) + (row.ck == null ? 0 : 3);
        const averageValue = roundGrade((row.tx.reduce((sum, value) => sum + value, 0) + (row.gk ?? 0) * 2 + (row.ck ?? 0) * 3) / denominator);
        await gradingRepository(tx).average(row.studentId, assignmentId, assignment.academicTermId, averageValue);
      } else await gradingRepository(tx).removeAverage(row.studentId, assignmentId, assignment.academicTermId);
      const was: ScoreSet = { tx: before.filter((e) => e.scoreType === "THUONG_XUYEN").map((e) => e.value), gk: before.find((e) => e.scoreType === "GIUA_KY")?.value ?? null, ck: before.find((e) => e.scoreType === "CUOI_KY")?.value ?? null };
      const now: ScoreSet = { tx: row.tx, gk: row.gk, ck: row.ck };
      if (scoresDiffer(was, now)) changes.push({ studentId: row.studentId, after: now });
      await records.appendAudit({ actorEmail: me.email, action: "save_scores", targetType: "ScoreEntry", targetId: row.studentId, reason, beforeData: JSON.parse(JSON.stringify(before)), afterData: JSON.parse(JSON.stringify(data)) }, tx);
    }
  }, { timeout: 30000 });
  // Báo học sinh + phụ huynh những em có điểm thay đổi (chỉ khi điểm đang hiển thị). Lỗi thông báo không ảnh hưởng việc lưu điểm.
  await notifyScoresChanged({ subjectName: a.subject.subjectName, termName: a.academicTerm.termName, gradesHidden: a.academicTerm.gradesHidden, changes });
  return { assignmentId, changed: rows.length };
}
