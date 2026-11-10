import { roundGrade } from "./annual";
import { withTransaction } from "@/infrastructure/database/unit-of-work";
import * as records from "@/modules/academic/records.repository";
import { yearResultRepository } from "@/modules/promotion/promotion.repository";
import { gradingRepository } from "./scoring.repository";
import { assertScoreWrite } from "./locking";
import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { canManageClassSubjectAssignment, canManageSchoolClass } from "@/lib/auth/permission";
import { ForbiddenError } from "@/shared/errors";
import * as scoringRepository from "@/modules/scoring/scoring.repository";
import type {
  CreateScoreEntryInput,
  UpsertScoreWeightConfigInput,
} from "@/modules/scoring/scoring.schema";

const DEFAULT_WEIGHTS = { txWeight: 1, gkWeight: 2, ckWeight: 3 } as const;

export async function upsertScoreWeightConfig(
  user: SessionUser,
  input: UpsertScoreWeightConfigInput,
) {
  if (!isAdmin(user)) {
    throw new ForbiddenError(
      "Chỉ Hiệu trưởng/Hiệu phó được cấu hình hệ số tính điểm",
    );
  }
  if (input.txWeight !== 1 || input.gkWeight !== 2 || input.ckWeight !== 3) throw new Error("Hệ số đánh giá THPT cố định: TX 1, giữa kỳ 2, cuối kỳ 3");
  const term = await gradingRepository().term(input.academicTermId);
  if (term.isLocked || Date.now() > term.endDate.getTime() + 15 * 86400000) throw new Error("Không sửa cấu hình học kỳ đã khóa");
  return scoringRepository.upsertScoreWeightConfig(input);
}

/**
 * Giáo viên nhập điểm (chỉ với assignment mình được phân công), sau đó
 * tự động tính lại SubjectTermAverage của học sinh cho (assignment, kỳ) đó.
 */
export async function createScoreEntry(
  user: SessionUser,
  input: CreateScoreEntryInput,
) {
  const allowed = await canManageClassSubjectAssignment(
    user,
    input.assignmentId,
  );
  if (!allowed) {
    throw new ForbiddenError("Không có quyền nhập điểm cho môn học này");
  }

  return withTransaction(async (tx) => {
    const assignment = await assertScoreWrite(user, input.assignmentId, tx);
    if (assignment.academicTermId !== input.academicTermId || assignment.subject.assessmentType !== "SCORE") throw new Error("Học kỳ hoặc hình thức đánh giá không phù hợp");
    const enrollment = await records.findEnrollment(input.studentId, assignment.academicTerm.academicYearId, tx);
    if (!enrollment || enrollment.schoolClassId !== assignment.schoolClassId) throw new Error("Học sinh không thuộc lớp-môn");
    await records.lockEnrollment(enrollment.id, tx);
    if ((await yearResultRepository(tx).find(input.studentId, enrollment.academicYearId))?.reviewStatus === "APPROVED") throw new Error("Kết quả cuối năm đã duyệt");
    if (!Number.isFinite(input.value) || input.value < 0 || input.value > 10) throw new Error("Điểm từ 0 đến 10");
    if ((await gradingRepository(tx).assessment(input.studentId, input.assignmentId))?.isExempt) throw new Error("Học sinh được miễn đánh giá môn này");
    if (input.scoreType !== "THUONG_XUYEN" && (await gradingRepository(tx).entries(input.studentId, input.assignmentId, input.academicTermId)).filter((entry) => entry.scoreType === input.scoreType).length) throw new Error("Đã có điểm định kỳ loại này");
    const entry = await gradingRepository(tx).insertEntry(input);
    const entries = await gradingRepository(tx).entries(input.studentId, input.assignmentId, input.academicTermId);
    const weight = (type: string) => type === "THUONG_XUYEN" ? 1 : type === "GIUA_KY" ? 2 : 3;
    const averageValue = roundGrade(entries.reduce((sum, row) => sum + row.value * weight(row.scoreType), 0) / entries.reduce((sum, row) => sum + weight(row.scoreType), 0));
    await gradingRepository(tx).average(input.studentId, input.assignmentId, input.academicTermId, averageValue);
    await records.appendAudit({ actorEmail: user.email, action: "create_score", targetType: "ScoreEntry", targetId: entry.id, reason: "Thêm điểm môn học", afterData: JSON.parse(JSON.stringify(entry)) }, tx);
    return entry;
  });
}

/** Cập nhật điểm TB tạm tính theo hệ số 1/2/3. Tổng kết chính thức kiểm tra đủ cột trong annual-query. */
export async function recalculateSubjectTermAverage(
  studentId: string,
  assignmentId: string,
  academicTermId: string,
) {
  const entries = await scoringRepository.listScoreEntries(studentId, assignmentId, academicTermId);

  const weights = DEFAULT_WEIGHTS;

  let weightedSum = 0;
  let weightTotal = 0;

  for (const entry of entries) {
    const weight =
      entry.scoreType === "THUONG_XUYEN"
        ? weights.txWeight
        : entry.scoreType === "GIUA_KY"
          ? weights.gkWeight
          : weights.ckWeight;

    weightedSum += entry.value * weight;
    weightTotal += weight;
  }

  const averageValue = weightTotal > 0 ? weightedSum / weightTotal : 0;

  return scoringRepository.upsertSubjectTermAverage(
    studentId,
    assignmentId,
    academicTermId,
    roundGrade(averageValue),
  );
}

/** GVCN xem bảng điểm tổng hợp cả lớp mình chủ nhiệm; Hiệu trưởng/Hiệu phó xem được mọi lớp. */
export async function listSubjectTermAveragesByClass(
  user: SessionUser,
  schoolClassId: string,
  academicTermId: string,
) {
  const allowed = await canManageSchoolClass(user, schoolClassId);
  if (!allowed) {
    throw new ForbiddenError("Không có quyền xem bảng điểm của lớp này");
  }
  return scoringRepository.listSubjectTermAveragesByClass(schoolClassId, academicTermId);
}
