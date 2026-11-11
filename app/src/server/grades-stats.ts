import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { todayUTC } from "@/lib/format";

export const BANDS = [
  { key: "xs", label: "Xuất sắc", min: 9, color: "#22c55e" },
  { key: "gioi", label: "Giỏi", min: 8, color: "#3b82f6" },
  { key: "kha", label: "Khá", min: 6.5, color: "#06b6d4" },
  { key: "tb", label: "Trung bình", min: 5, color: "#f59e0b" },
  { key: "yeu", label: "Yếu", min: 0, color: "#ef4444" },
] as const;
export const bandOf = (norm: number) => BANDS.find((b) => norm >= b.min)!;

/** 3 nhóm cột điểm của trường phổ thông: thường xuyên (nhiều cột), giữa kỳ, cuối kỳ. */
export const CATS = [
  { key: "THUONG_XUYEN", name: "Thường xuyên" },
  { key: "GIUA_KY", name: "Giữa kỳ" },
  { key: "CUOI_KY", name: "Cuối kỳ" },
] as const;

export type AssignmentStat = {
  assessmentType: "SCORE" | "COMMENT";
  id: string; className: string; schoolClassId: string; subjectId: string; subjectName: string;
  termId: string; termName: string; finished: boolean; teacher: string | null;
  students: number; filled: number; expected: number; avgNorm: number | null; graded: number;
  cats: { key: string; name: string; avg: number | null; filled: number }[];
  rows: { studentId: string; name: string; code: string; norm: number | null }[];
};

/** Thống kê điểm theo lớp và môn (điểm TB môn đã ở thang 10 nên so sánh trực tiếp giữa các môn). */
export async function gradeStats(opts: { where?: Prisma.ClassSubjectAssignmentWhereInput; termId?: string; subjectId?: string; schoolClassId?: string; q?: string; includePast?: boolean } = {}): Promise<AssignmentStat[]> {
  const where: Prisma.ClassSubjectAssignmentWhereInput = {
    AND: [
      opts.where ?? {},
      opts.termId ? { academicTermId: opts.termId } : {},
      opts.subjectId ? { subjectId: opts.subjectId } : {},
      opts.schoolClassId ? { schoolClassId: opts.schoolClassId } : {},
      opts.q ? { OR: [{ schoolClass: { className: { contains: opts.q, mode: "insensitive" } } }, { subject: { subjectName: { contains: opts.q, mode: "insensitive" } } }] } : {},
      opts.includePast ? {} : { academicTerm: { endDate: { gte: todayUTC() } } },
    ],
  };
  const assignments = await db.classSubjectAssignment.findMany({
    where,
    orderBy: [{ schoolClass: { className: "asc" } }, { subject: { subjectName: "asc" } }],
    include: {
      teacher: true, subject: true, academicTerm: true,
      schoolClass: { include: { enrollments: { include: { student: { select: { id: true, fullName: true, code: true } } } } } },
    },
  });
  const ids = assignments.map((a) => a.id);
  const [entries, averages, reviews] = await Promise.all([
    db.scoreEntry.findMany({ where: { assignmentId: { in: ids } } }),
    db.subjectTermAverage.findMany({ where: { assignmentId: { in: ids } } }),
    db.studentAssessment.findMany({ where: { assignmentId: { in: ids } } }),
  ]);
  const today = todayUTC();

  return assignments.map((a) => {
    const seen = new Set<string>();
    const studs = a.schoolClass.enrollments.map((e) => e.student).filter((s) => !seen.has(s.id) && seen.add(s.id));
    const assessmentOf = new Map(reviews.filter((review) => review.assignmentId === a.id).map((review) => [review.studentId, review]));
    const numericStudents = studs.filter((student) => !assessmentOf.get(student.id)?.isExempt);
    const es = entries.filter((e) => e.assignmentId === a.id && !assessmentOf.get(e.studentId)?.isExempt);
    const avgOf = new Map(averages.filter((x) => x.assignmentId === a.id).map((x) => [x.studentId, x.averageValue]));
    const rows = studs.map((s) => ({ studentId: s.id, name: s.fullName, code: s.code ?? "", norm: a.subject.assessmentType === "SCORE" && !assessmentOf.get(s.id)?.isExempt && avgOf.has(s.id) && es.some((e) => e.studentId === s.id) ? avgOf.get(s.id)! : null }));
    const graded = rows.filter((r) => r.norm != null);
    const filled = a.subject.assessmentType === "COMMENT"
      ? numericStudents.filter((student) => assessmentOf.get(student.id)?.outcome != null).length
      : numericStudents.reduce((n, s) => n + CATS.filter((c) => es.some((e) => e.studentId === s.id && e.scoreType === c.key)).length, 0);
    return {
      assessmentType: a.subject.assessmentType,
      id: a.id, className: a.schoolClass.className, schoolClassId: a.schoolClassId, subjectId: a.subjectId, subjectName: a.subject.subjectName,
      termId: a.academicTermId, termName: a.academicTerm.termName, finished: a.academicTerm.endDate < today, teacher: a.teacher.fullName,
      students: studs.length, filled, expected: numericStudents.length * (a.subject.assessmentType === "COMMENT" ? 1 : CATS.length),
      avgNorm: graded.length ? Math.round((graded.reduce((x, r) => x + r.norm!, 0) / graded.length) * 100) / 100 : null, graded: graded.length,
      cats: CATS.map((c) => {
        const cv = es.filter((e) => e.scoreType === c.key);
        return { key: c.key, name: c.name, avg: cv.length ? Math.round((cv.reduce((x, e) => x + e.value, 0) / cv.length) * 100) / 100 : null, filled: cv.length };
      }),
      rows,
    };
  });
}
