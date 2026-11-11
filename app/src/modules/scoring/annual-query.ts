import type { DatabaseContext } from "@/infrastructure/database/unit-of-work";
import { gradingRepository } from "./scoring.repository";
import { annualSubjectAverage, semesterAverage, requiredRegularScores, DEFAULT_WEIGHTS, type AnnualSubject } from "./annual";

const weightsOf = (c: { txWeight: number; gkWeight: number; ckWeight: number } | null | undefined) => (c ? { tx: c.txWeight, gk: c.gkWeight, ck: c.ckWeight } : DEFAULT_WEIGHTS);

/** Dùng cùng phép tính ở giao diện và server; không nhận điểm tổng kết từ form. */
export async function loadAnnualSubjects(studentId: string, academicYearId: string, context?: DatabaseContext): Promise<AnnualSubject[]> {
  const repository = gradingRepository(context);
  const enrollment = await repository.enrollmentCurriculum(studentId, academicYearId);
  if (!enrollment) return [];
  const assignments = await repository.annualAssignments(studentId, academicYearId, enrollment.schoolClassId);
  return enrollment.schoolClass.subjects.map(({ subject }) => {
    const missing: string[] = [];
    const parts = ["HK1", "HK2"].map((termName) => {
      const assignment = assignments.find((row) => row.subjectId === subject.id && row.academicTerm.termName === termName);
      if (!assignment) { missing.push(`thiếu phân công ${termName}`); return { average: null, outcome: null, exempt: false }; }
      const review = assignment.assessments[0];
      if (review?.adjustmentReason) missing.push(`${termName} có quyết định điều chỉnh: cần xác định quy tắc riêng trước khi chốt`);
      if (review?.isExempt) return { average: null, outcome: null, exempt: true };
      if (subject.assessmentType === "COMMENT") {
        if (!review?.outcome) missing.push(`chưa có nhận xét ${termName}`);
        return { average: null, outcome: review?.outcome ?? null, exempt: false };
      }
      const entries = assignment.scoreEntries;
      const txScores = entries.filter((row) => row.scoreType === "THUONG_XUYEN").map((row) => row.value);
      const gk = entries.filter((row) => row.scoreType === "GIUA_KY");
      const ck = entries.filter((row) => row.scoreType === "CUOI_KY");
      const average = gk.length === 1 && ck.length === 1 ? semesterAverage(txScores, gk[0].value, ck[0].value, requiredRegularScores(subject.annualPeriods), weightsOf(assignment.academicTerm.scoreWeightConfig)) : null;
      if (average == null) missing.push(`chưa đủ điểm ${termName}`);
      return { average, outcome: null, exempt: false };
    });
    const exempt = parts.every((part) => part.exempt);
    // Chỉ miễn một kỳ cần quyết định riêng; không tự lấy điểm kỳ còn lại làm điểm cả năm.
    if (!exempt && parts.some((part) => part.exempt)) missing.push("miễn một học kỳ: cần xử lý quyết định đánh giá cả năm");
    const average = annualSubjectAverage(parts[0].average, parts[1].average);
    const outcome = subject.assessmentType === "COMMENT" && !exempt && !missing.length
      ? parts[1].outcome === "DAT" ? "DAT" : "CHUA_DAT" : null;
    return { subjectId: subject.id, name: subject.subjectName, type: subject.assessmentType, first: parts[0].average, second: parts[1].average, average, outcome, exempt, missing };
  });
}
