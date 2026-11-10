import { withTransaction, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
import * as records from "@/modules/academic/records.repository";
import { isDeepStrictEqual } from "node:util";
import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { requireYearStudentWriter } from "./permission";
import { loadAnnualSubjects } from "@/modules/scoring/annual-query";
import { suggestPromotion } from "@/modules/scoring/annual";
import { createYearEndResultSchema } from "./promotion.schema";
import { CLASS_CAPACITY } from "@/lib/catalog";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import * as promotionRepository from "@/modules/promotion/promotion.repository";
import type {
  CreateYearEndResultInput,
  RunClassPromotionJobInput,
} from "@/modules/promotion/promotion.schema";

/** Hiệu trưởng/Hiệu phó ghi cho mọi học sinh; GVCN chỉ ghi được cho học sinh lớp mình chủ nhiệm. */
export async function createYearEndResult(
  user: SessionUser,
  input: CreateYearEndResultInput,
  client?: DatabaseContext,
) {
  const data = createYearEndResultSchema.parse(input);
  const work = async (tx: DatabaseContext) => {
    await requireYearStudentWriter(user, data.studentId, data.academicYearId, tx);
    await records.lockStudentYear(data.studentId, data.academicYearId, tx);
    const previous = await promotionRepository.yearResultRepository(tx).find(data.studentId, data.academicYearId);
    if (previous?.reviewStatus === "APPROVED") throw new Error("Kết quả đã duyệt. Cần mở lại hồ sơ trước khi sửa");
    const subjects = await loadAnnualSubjects(data.studentId, data.academicYearId, tx);
    const evaluation = suggestPromotion(subjects, data.conductRank, data.absenceDays);
    const update = {
      overallAverage: evaluation.overallAverage, conductRank: data.conductRank ?? null,
      absenceDays: data.absenceDays ?? null, result: evaluation.result,
      reviewStatus: evaluation.missing.length ? "DRAFT" as const : "SUBMITTED" as const,
      submittedBy: user.email, approvedAt: null, approvedBy: null,
      evaluation: JSON.parse(JSON.stringify({ ...evaluation, subjects })),
    };
    const result = await promotionRepository.yearResultRepository(tx).save(data.studentId, data.academicYearId, update);
    await records.appendAudit({ actorEmail: user.email, action: "submit_year_result", targetType: "YearEndResult", targetId: result.id, beforeData: JSON.parse(JSON.stringify(previous)), afterData: JSON.parse(JSON.stringify(result)) }, tx);
    return result;
  };
  return client ? work(client) : withTransaction(work);
}

export function listYearEndResults(academicYearId: string) {
  return promotionRepository.listYearEndResultsByYear(academicYearId);
}

/**
 * Chạy job chuyển lớp hàng loạt: với mỗi (studentId, targetSchoolClassId) do Hiệu trưởng
 * chỉ định tường minh, tạo StudentClassEnrollment mới cho năm học kế tiếp. Lớp đích đã được
 * chọn sẵn (lên lớp cùng khối-kế-tiếp hay ở lại khối cũ đều là một targetSchoolClassId cụ thể,
 * không suy luận tự động bằng tên lớp).
 */
export async function runClassPromotionJob(
  user: SessionUser,
  input: RunClassPromotionJobInput,
) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được chạy lên lớp cuối năm");
  }

  const job = await promotionRepository.createPromotionJob(
    input.academicYearFromId,
    input.academicYearToId,
  );

  try {
    const count = await withTransaction(async (tx) => {
      if (new Set(input.assignments.map((row) => row.studentId)).size !== input.assignments.length) throw new Error("Học sinh bị lặp trong danh sách chuyển năm");
      const from = await records.findYear(input.academicYearFromId, tx);
      const to = await records.findYear(input.academicYearToId, tx);
      if (to.startDate <= from.endDate) throw new Error("Năm đích phải sau năm nguồn");
      for (const classId of [...new Set(input.assignments.map((row) => row.targetSchoolClassId))].sort()) await records.lockClass(classId, tx);
      let created = 0;
      for (const row of [...input.assignments].sort((a, b) => a.studentId.localeCompare(b.studentId))) {
        const enrollment = await requireYearStudentWriter(user, row.studentId, from.id, tx);
        await records.lockEnrollment(enrollment.id, tx);
        const result = await promotionRepository.yearResultRepository(tx).find(row.studentId, from.id);
        if (!result || result.reviewStatus !== "APPROVED" || !["LEN_LOP", "O_LAI"].includes(result.result)) throw new Error("Học sinh chưa có kết quả đủ điều kiện và đã được phê duyệt");
        const target = await records.findClass(row.targetSchoolClassId, tx);
        if (target.academicYearId !== to.id) throw new Error("Lớp đích không thuộc năm học đích");
        const existing = await records.findEnrollment(row.studentId, to.id, tx);
        if (existing) {
          if (existing.schoolClassId !== target.id) throw new Error("Học sinh đã được xếp vào một lớp đích khác");
          continue;
        }
        if (await records.countClassEnrollments(target.id, tx) >= CLASS_CAPACITY) throw new Error(`Lớp ${target.className} đã đủ sĩ số`);
        await records.createEnrollment({ studentId: row.studentId, schoolClassId: target.id, academicYearId: to.id, currentClassSince: to.startDate }, tx);
        created++;
      }
      await promotionRepository.yearResultRepository(tx).completeJob(job.id, `Đã tạo ${created}/${input.assignments.length} ghi danh; các ghi danh đúng lớp đã có được giữ nguyên.`);
      return created;
    }, { timeout: 30000 });
    return { ...job, status: "DONE" as const, enrollmentsCreated: count };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    await promotionRepository.markPromotionJobFailed(job.id, message);
    throw new ConflictError(`Chạy lên lớp thất bại: ${message}`);
  }
}


export async function reviewYearResult(user: SessionUser, studentId: string, academicYearId: string, approve: boolean, reason: string) {
  if (!isAdmin(user)) throw new ForbiddenError("Chỉ quản lý được phê duyệt hoặc mở lại kết quả");
  if (reason.trim().length < 10) throw new Error("Nhập lý do/xác nhận duyệt ít nhất 10 ký tự");
  return withTransaction(async (tx) => {
    await requireYearStudentWriter(user, studentId, academicYearId, tx);
    await records.lockStudentYear(studentId, academicYearId, tx);
    const previous = await promotionRepository.yearResultRepository(tx).find(studentId, academicYearId);
    if (!previous) throw new Error("Chưa có kết quả cuối năm");
    if (approve) {
      if (previous.reviewStatus !== "SUBMITTED") throw new Error("Chỉ duyệt hồ sơ đã trình và đủ dữ liệu");
      const subjects = await loadAnnualSubjects(studentId, academicYearId, tx);
      const evaluation = suggestPromotion(subjects, previous.conductRank, previous.absenceDays);
      if (evaluation.missing.length || evaluation.result !== previous.result || evaluation.overallAverage !== previous.overallAverage || !isDeepStrictEqual((previous.evaluation as { subjects?: unknown })?.subjects, subjects)) throw new Error("Dữ liệu môn học đã thay đổi hoặc chưa đủ. Hãy tổng hợp và trình lại");
    } else if (previous.reviewStatus !== "APPROVED") throw new Error("Hồ sơ chưa được duyệt");
    const result = await promotionRepository.yearResultRepository(tx).update(studentId, academicYearId, { reviewStatus: approve ? "APPROVED" : "DRAFT", approvedBy: approve ? user.email : null, approvedAt: approve ? new Date() : null });
    await records.appendAudit({ actorEmail: user.email, action: approve ? "approve_year_result" : "reopen_year_result", targetType: "YearEndResult", targetId: result.id, reason, beforeData: JSON.parse(JSON.stringify(previous)), afterData: JSON.parse(JSON.stringify(result)) }, tx);
    return result;
  });
}

export async function resolveReExam(user: SessionUser, input: { studentId: string; academicYearId: string; result: "LEN_LOP" | "O_LAI"; score: number }) {
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 10 || !["LEN_LOP", "O_LAI"].includes(input.result)) throw new Error("Kết quả thi lại không hợp lệ");
  return withTransaction(async (tx) => {
    await requireYearStudentWriter(user, input.studentId, input.academicYearId, tx);
    await records.lockStudentYear(input.studentId, input.academicYearId, tx);
    const before = await promotionRepository.yearResultRepository(tx).find(input.studentId, input.academicYearId);
    if (!before) throw new Error("Chưa có kết quả cuối năm");
    if (before.result !== "THI_LAI") throw new Error("Học sinh không ở trạng thái chờ đánh giá lại");
    if (before.reviewStatus === "APPROVED") throw new Error("Hồ sơ đã duyệt. Quản lý cần mở lại trước khi cập nhật");
    // Không ghi đè một điểm thi lại vào ĐTB cả năm. Kết quả chính thức phải tổng hợp lại theo môn.
    const result = await promotionRepository.yearResultRepository(tx).update(input.studentId, input.academicYearId, { reviewStatus: "DRAFT", evaluation: { pendingReExam: true, proposedResult: input.result, referenceScore: input.score, previousEvaluation: before.evaluation } });
    await records.appendAudit({ actorEmail: user.email, action: "resolve_re_exam", targetType: "YearEndResult", targetId: result.id, beforeData: JSON.parse(JSON.stringify(before)), afterData: JSON.parse(JSON.stringify(result)) }, tx);
    return result;
  });
}

export async function submitClassResults(user: SessionUser, academicYearId: string, students: CreateYearEndResultInput[]) {
  if (!students.length || students.length > 100) throw new Error("Chọn từ 1 đến 100 học sinh chưa duyệt");
  const unique = [...new Map(students.map((student) => [student.studentId, student])).values()].sort((a, b) => a.studentId.localeCompare(b.studentId));
  await withTransaction(async (context) => {
    for (const student of unique) await createYearEndResult(user, { ...student, academicYearId }, context);
  }, { timeout: 30000 });
  return { count: unique.length };
}
export async function promoteClasses(user: SessionUser, input: { fromYearId: string; toYearId: string; routes: { classId: string; up: string; stay: string }[] }) {
  if (!isAdmin(user)) throw new ForbiddenError();
  if (!input.fromYearId || !input.toYearId || input.fromYearId === input.toYearId) throw new Error("Chọn hai năm học nguồn và đích khác nhau");
  const [source, target] = await Promise.all([promotionRepository.classesForYear(input.fromYearId), promotionRepository.classesForYear(input.toYearId)]);
  const validTarget = new Set(target.map((cls) => cls.id));
  const assignments: { studentId: string; targetSchoolClassId: string }[] = [];
  for (const cls of source) {
    const route = input.routes.find((route) => route.classId === cls.id);
    const up = route?.up || "", stay = route?.stay || "";
    for (const targetId of [up, stay]) if (targetId && !validTarget.has(targetId)) throw new Error(`Lớp đích của ${cls.className} không thuộc năm học đích`);
    const results = await promotionRepository.approvedClassResults(input.fromYearId, cls.id);
    if (results.some((result) => result.result === "LEN_LOP") && !up) throw new Error(`Chọn lớp đích cho học sinh lên lớp của ${cls.className}`);
    for (const result of results) {
      if (result.result === "LEN_LOP") assignments.push({ studentId: result.studentId, targetSchoolClassId: up });
      if (result.result === "O_LAI" && stay) assignments.push({ studentId: result.studentId, targetSchoolClassId: stay });
    }
  }
  if (!assignments.length) throw new Error("Chưa có học sinh đủ điều kiện chuyển năm");
  const job = await runClassPromotionJob(user, { academicYearFromId: input.fromYearId, academicYearToId: input.toYearId, assignments });
  await records.appendAudit({ actorEmail: user.email, action: "run_promotion", targetType: "ClassPromotionJob", targetId: job.id });
  return { created: job.enrollmentsCreated, total: assignments.length };
}
export async function loadClassYearReview(user: SessionUser, classId: string, academicYearId: string) {
  const cls = await records.findClass(classId);
  if (cls.academicYearId !== academicYearId || (!isAdmin(user) && (!user.teacherId || cls.homeroomTeacherId !== user.teacherId || !user.roles.includes("HOMEROOM_TEACHER")))) throw new ForbiddenError();
  return promotionRepository.classYearReview(classId, academicYearId);
}
