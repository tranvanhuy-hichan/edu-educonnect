import { PageCrumbs } from "@/components/page-crumbs";
import { School } from "lucide-react";
import { DrillGrid } from "@/components/drill-cards";
import { db } from "@/lib/db";
import { Card, Title } from "@/components/ui";
import { isManager } from "@/server/learning-scope";
import { loadGrade, loadSubject, teachingScope, requireTeachingViewer } from "@/server/teaching-scope";

export default async function TeachingGrade({ params, searchParams }: { params: Promise<{ subjectId: string; gradeId: string }>; searchParams: Promise<{ gv?: string }> }) {
  const me = await requireTeachingViewer();
  const { subjectId, gradeId } = await params;
  const { gv } = await searchParams;
  const [subject, grade] = await Promise.all([loadSubject(me, subjectId), loadGrade(gradeId)]);
  const assignments = await db.classSubjectAssignment.findMany({
    where: { AND: [teachingScope(me), { subjectId, schoolClass: { gradeLevelId: gradeId } }, gv && isManager(me) ? { teacherId: gv } : {}] },
    include: { schoolClass: { include: { _count: { select: { enrollments: true } } } }, teacher: { select: { fullName: true } }, academicTerm: { select: { termName: true, startDate: true } }, _count: { select: { lessonPosts: true } } },
    orderBy: { schoolClass: { className: "asc" } },
  });
  const byClass = new Map<string, typeof assignments>();
  for (const a of assignments) (byClass.get(a.schoolClassId) ?? byClass.set(a.schoolClassId, []).get(a.schoolClassId)!).push(a);

  return (
    <div className="space-y-4">
      <PageCrumbs items={[{ label: "Giảng dạy", href: "/giang-day" }, { label: subject.subjectName, href: `/giang-day?mon=${subjectId}` }, { label: grade.gradeName }]} />
      <Title>{subject.subjectName} · {grade.gradeName}: chọn lớp</Title>
      {!byClass.size ? <Card className="text-sm text-slate-600">{isManager(me) ? "Chưa có lớp nào của khối này được phân công môn này." : "Bạn chưa được phân công lớp nào của khối này."}</Card> : (
        <DrillGrid items={[...byClass.values()].map((list) => {
          const c = list[0].schoolClass;
          return {
            href: `/giang-day/${subjectId}/${gradeId}/${c.id}`, title: c.className, icon: School, tone: "bg-orange-100 text-orange-700",
            stats: [{ value: c._count.enrollments, label: "học sinh" }, { value: list.reduce((t, a) => t + a._count.lessonPosts, 0), label: "bài học đã đăng" }],
            note: isManager(me) ? `GV: ${[...new Set(list.map((a) => a.teacher.fullName))].join(", ")}` : undefined,
            chips: list.sort((x, y) => y.academicTerm.startDate.getTime() - x.academicTerm.startDate.getTime()).map((a) => a.academicTerm.termName),
          };
        })} />
      )}
    </div>
  );
}
