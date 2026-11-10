import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { Title } from "@/components/ui";
import { GradeGrid } from "./grid";

const MIN_TX = 4;

export default async function AssignmentGrades({ params }: { params: Promise<{ assignmentId: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const { assignmentId } = await params;
  const a = await db.classSubjectAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      teacher: true, subject: true, academicTerm: { include: { academicYear: true, scoreWeightConfig: true } },
      schoolClass: { include: { enrollments: { include: { student: true } } } },
    },
  });
  if (!a || !(await canManageClassSubjectAssignment(me, assignmentId))) notFound();

  const entries = await db.scoreEntry.findMany({ where: { assignmentId }, orderBy: { createdAt: "asc" } });
  const initial: Record<string, number> = {};
  const txCount = new Map<string, number>();
  for (const e of entries) {
    if (e.scoreType === "THUONG_XUYEN") {
      const n = txCount.get(e.studentId) ?? 0;
      initial[`${e.studentId}|tx${n}`] = e.value;
      txCount.set(e.studentId, n + 1);
    } else initial[`${e.studentId}|${e.scoreType === "GIUA_KY" ? "gk" : "ck"}`] = e.value;
  }
  const txCols = Math.max(MIN_TX, ...txCount.values());
  const w = a.academicTerm.scoreWeightConfig;
  const weights = { tx: w?.txWeight ?? 1, gk: w?.gkWeight ?? 2, ck: w?.ckWeight ?? 3 };

  const seen = new Set<string>();
  const students = a.schoolClass.enrollments
    .filter((e) => !seen.has(e.studentId) && seen.add(e.studentId))
    .map((e) => ({ id: e.studentId, name: e.student.fullName, code: e.student.code ?? "" }))
    .sort((x, y) => x.name.localeCompare(y.name, "vi"));

  const isManager = me.roles.some((r) => (MANAGER_ROLES as readonly string[]).includes(r));
  const term = a.academicTerm;
  const isPast15Days = term.endDate && (Date.now() - new Date(term.endDate).getTime() > 15 * 24 * 60 * 60 * 1000);
  const isLocked = term.isLocked || Boolean(isPast15Days);
  const readOnly = isLocked && !isManager;

  return (
    <div className="space-y-3">
      <Title>Bảng điểm: {a.schoolClass.className} · {a.subject.subjectName}</Title>
      <p className="text-sm text-gray-600">
        {a.academicTerm.termName} · {a.academicTerm.academicYear.yearName} · GV: {a.teacher.fullName} · Điểm TB môn tính theo hệ số học kỳ:
        {" "}<code>thường xuyên ×{weights.tx}, giữa kỳ ×{weights.gk}, cuối kỳ ×{weights.ck}</code> (thang 10)
      </p>
      <GradeGrid
        assignmentId={assignmentId}
        txCols={txCols}
        weights={weights}
        students={students}
        initial={initial}
        readOnly={readOnly}
        isLocked={isLocked}
        isManager={isManager}
        termId={term.id}
        termName={term.termName}
        isManualLocked={term.isLocked}
        lockedBy={term.lockedBy}
      />
    </div>
  );
}
