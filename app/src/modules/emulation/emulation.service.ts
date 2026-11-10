import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { canManageSchoolClass } from "@/lib/auth/permission";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import * as emulationRepository from "@/modules/emulation/emulation.repository";
import type {
  CreateEmulationCriteriaInput,
  RecalculateClassEmulationScoreInput,
} from "@/modules/emulation/emulation.schema";

export async function createCriteria(
  user: SessionUser,
  input: CreateEmulationCriteriaInput,
) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được cấu hình tiêu chí thi đua");
  }
  return emulationRepository.createCriteria(input);
}

export function listCriteria() {
  return emulationRepository.listCriteria();
}

/**
 * Công thức tổng hợp (mặc định, chưa có cấu hình trọng số tùy biến theo EmulationCriteria —
 * xem Rủi ro trong docs/phan-tich-yeu-cau.md, cần xác nhận lại trọng số thật của trường):
 *
 *   totalScore = điểm học tập trung bình lớp (thang 10, quy đổi hệ số 10)
 *                - (tổng số lượt vắng trong kỳ) * 0.5
 *                - (số tiết không xếp loại TOT) * 1
 *
 * Điểm càng cao thi đua càng tốt. Dùng chung cho cả lưu điểm lẫn hiển thị thành phần để hai nơi luôn khớp.
 */
export async function computeEmulation(schoolClassId: string, academicTermId: string, range?: emulationRepository.DateRange) {
  const [academicAverage, periodStats, nonTotCount] = await Promise.all([
    emulationRepository.averageSubjectScoreForClass(schoolClassId, academicTermId),
    emulationRepository.aggregatePeriodLogStats(schoolClassId, range),
    emulationRepository.countNonTotPeriodLogs(schoolClassId, range),
  ]);
  const totalAbsences = periodStats._sum.attendanceAbsentCount ?? 0;
  const totalScore = Math.round((academicAverage * 10 - totalAbsences * 0.5 - nonTotCount * 1) * 100) / 100;
  return { academicAverage, totalAbsences, nonTotCount, totalScore };
}

const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
/** Ghi khoảng ngày vào nhãn kỳ ("Tuần 1 (07/09/2026–13/09/2026)") để sau này tính lại/hiển thị đúng khoảng đó. */
export function formatPeriodLabel(label: string, from?: Date, to?: Date) {
  return from && to ? `${label.trim()} (${fmt(from)}–${fmt(to)})` : label.trim();
}
export function parsePeriodRange(label: string): emulationRepository.DateRange | undefined {
  const m = label.match(/\((\d{2})\/(\d{2})\/(\d{4})–(\d{2})\/(\d{2})\/(\d{4})\)$/);
  if (!m) return undefined;
  return { from: new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])), to: new Date(Date.UTC(+m[6], +m[5] - 1, +m[4])) };
}

export async function recalculateClassEmulationScore(
  user: SessionUser,
  input: RecalculateClassEmulationScoreInput,
) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được tổng hợp thi đua");
  }
  const periodLabel = formatPeriodLabel(input.periodLabel, input.from, input.to);
  const { totalScore } = await computeEmulation(input.schoolClassId, input.academicTermId, { from: input.from, to: input.to });
  const score = await emulationRepository.upsertClassEmulationScore(input.schoolClassId, input.academicTermId, periodLabel, totalScore);
  await emulationRepository.recalculateRanks(input.academicTermId, periodLabel);
  return score;
}

/** Tổng hợp thi đua cho một lớp hoặc tất cả lớp của năm học chứa học kỳ; xếp hạng một lần ở cuối. */
export async function recalculateEmulationForTerm(
  user: SessionUser,
  input: { academicTermId: string; periodLabel: string; schoolClassId?: string; from?: Date; to?: Date },
) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được tổng hợp thi đua");
  }
  if (!input.periodLabel.trim()) throw new ConflictError("Nhập tên kỳ thi đua");
  if (input.from && input.to && input.from > input.to) throw new ConflictError("Ngày bắt đầu phải trước ngày kết thúc");
  const term = await emulationRepository.findTerm(input.academicTermId);
  if (!term) throw new ConflictError("Học kỳ không tồn tại");

  const periodLabel = formatPeriodLabel(input.periodLabel, input.from, input.to);
  const classIds = input.schoolClassId
    ? [input.schoolClassId]
    : (await emulationRepository.listClassesOfYear(term.academicYearId)).map((c) => c.id);
  if (!classIds.length) throw new ConflictError("Chưa có lớp nào trong năm học này");

  for (const schoolClassId of classIds) {
    const { totalScore } = await computeEmulation(schoolClassId, input.academicTermId, { from: input.from, to: input.to });
    await emulationRepository.upsertClassEmulationScore(schoolClassId, input.academicTermId, periodLabel, totalScore);
  }
  await emulationRepository.recalculateRanks(input.academicTermId, periodLabel);
  return { periodLabel, classes: classIds.length };
}

export function listRanking(academicTermId: string, periodLabel: string) {
  return emulationRepository.listRankingByTerm(academicTermId, periodLabel);
}

/** GVCN xem lịch sử thi đua của lớp mình chủ nhiệm. */
export async function listEmulationScoresForClass(
  user: SessionUser,
  schoolClassId: string,
) {
  const allowed = await canManageSchoolClass(user, schoolClassId);
  if (!allowed) {
    throw new ForbiddenError("Không có quyền xem thi đua của lớp này");
  }
  return emulationRepository.listEmulationScoresBySchoolClass(schoolClassId);
}
