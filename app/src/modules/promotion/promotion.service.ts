import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { canViewStudent } from "@/lib/auth/permission";
import { ConflictError, ForbiddenError } from "@/modules/academic/academic.service";
import * as promotionRepository from "@/modules/promotion/promotion.repository";
import type {
  CreateYearEndResultInput,
  RunClassPromotionJobInput,
} from "@/modules/promotion/promotion.schema";

/** Hiệu trưởng/Hiệu phó ghi cho mọi học sinh; GVCN chỉ ghi được cho học sinh lớp mình chủ nhiệm. */
export async function createYearEndResult(
  user: SessionUser,
  input: CreateYearEndResultInput,
) {
  if (!isAdmin(user)) {
    const allowed = await canViewStudent(user, input.studentId);
    if (!allowed) {
      throw new ForbiddenError(
        "Chỉ Hiệu trưởng/Hiệu phó hoặc GVCN của lớp học sinh đó được ghi nhận kết quả cuối năm",
      );
    }
  }
  return promotionRepository.upsertYearEndResult(input);
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
    const entries = input.assignments.map((assignment) => ({
      studentId: assignment.studentId,
      schoolClassId: assignment.targetSchoolClassId,
      academicYearId: input.academicYearToId,
    }));

    const result = await promotionRepository.createEnrollmentsBatch(entries);

    await promotionRepository.markPromotionJobDone(
      job.id,
      `Đã tạo ${result.count}/${entries.length} bản ghi enrollment (bỏ qua trùng lặp nếu có).`,
    );

    return { ...job, status: "DONE" as const, enrollmentsCreated: result.count };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    await promotionRepository.markPromotionJobFailed(job.id, message);
    throw new ConflictError(`Chạy lên lớp thất bại: ${message}`);
  }
}
