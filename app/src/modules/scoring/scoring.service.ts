import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { canManageClassSubjectAssignment, canManageSchoolClass } from "@/lib/auth/permission";
import { ForbiddenError } from "@/modules/academic/academic.service";
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

  await scoringRepository.createScoreEntry(input);
  return recalculateSubjectTermAverage(
    input.studentId,
    input.assignmentId,
    input.academicTermId,
  );
}

/**
 * Công thức mặc định (ScoreWeightConfig): TB = (ΣTX×txWeight + GK×gkWeight + CK×ckWeight)
 * / (số lượng điểm TX×txWeight + gkWeight (nếu có GK) + ckWeight (nếu có CK)).
 * Hệ số lấy từ ScoreWeightConfig của học kỳ; nếu học kỳ chưa cấu hình, dùng mặc định 1/2/3.
 * LƯU Ý: công thức này là giả định phổ biến, cần xác nhận lại quy chế thật của trường
 * (xem Rủi ro #1 trong docs/phan-tich-yeu-cau.md) trước khi dùng chính thức.
 */
export async function recalculateSubjectTermAverage(
  studentId: string,
  assignmentId: string,
  academicTermId: string,
) {
  const [entries, weightConfig] = await Promise.all([
    scoringRepository.listScoreEntries(studentId, assignmentId, academicTermId),
    scoringRepository.findScoreWeightConfig(academicTermId),
  ]);

  const weights = weightConfig ?? DEFAULT_WEIGHTS;

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
    Math.round(averageValue * 100) / 100,
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
