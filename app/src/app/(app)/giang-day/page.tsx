import Link from "next/link";
import { db } from "@/lib/db";
import { SubjectGradeGrid } from "@/components/drill-cards";
import { Title } from "@/components/ui";
import { isManager } from "@/server/learning-scope";
import { teachingScope, requireTeachingViewer } from "@/server/teaching-scope";

export default async function Teaching({ searchParams }: { searchParams: Promise<{ mon?: string; gv?: string }> }) {
  const me = await requireTeachingViewer();
  const { mon, gv } = await searchParams;
  const manager = isManager(me);
  const [rows, grades, allSubjects, teachers] = await Promise.all([
    db.classSubjectAssignment.findMany({ where: { AND: [teachingScope(me), gv && manager ? { teacherId: gv } : {}] }, select: { subjectId: true, schoolClassId: true, schoolClass: { select: { gradeLevelId: true } } } }),
    db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    db.subject.findMany({ orderBy: { subjectName: "asc" } }),
    manager ? db.teacher.findMany({ where: { assignments: { some: {} } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : Promise.resolve([]),
  ]);
  // số lớp (không trùng) theo môn và theo khối
  const classes = new Map<string, Map<string, Set<string>>>();
  for (const r of rows) {
    const bySubject = classes.get(r.subjectId) ?? classes.set(r.subjectId, new Map()).get(r.subjectId)!;
    (bySubject.get(r.schoolClass.gradeLevelId) ?? bySubject.set(r.schoolClass.gradeLevelId, new Set()).get(r.schoolClass.gradeLevelId)!).add(r.schoolClassId);
  }
  const total = (id: string) => [...(classes.get(id)?.values() ?? [])].reduce((n, s) => n + s.size, 0);
  const subjects = allSubjects.filter((s) => ((manager && !gv) || classes.has(s.id)) && (!mon || s.id === mon));

  return (
    <div className="space-y-4">
      <Title right={mon ? <Link href="/giang-day" className="text-sm text-orange-700 hover:underline">Xem tất cả môn</Link> : undefined}>Giảng dạy</Title>
      {manager && (
        <form className="flex flex-wrap items-center gap-2">
          {mon && <input type="hidden" name="mon" value={mon} />}
          <select name="gv" defaultValue={gv ?? ""} aria-label="Giáo viên" className="h-9 rounded-md border bg-white px-3 text-sm" >
            <option value="">Tất cả giáo viên</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
          </select>
          <button className="h-9 rounded-md border bg-white px-3 text-sm font-medium hover:bg-slate-50">Lọc</button>
          {gv && <Link href={mon ? `/giang-day?mon=${mon}` : "/giang-day"} className="text-sm text-orange-700 hover:underline">Bỏ lọc</Link>}
        </form>
      )}
      <SubjectGradeGrid
        emptyText="Bạn chưa được phân công giảng dạy môn nào."
        items={subjects.map((s) => ({
          id: s.id, name: s.subjectName, summary: `${total(s.id)} lớp được phân công`,
          grades: grades.map((g) => { const n = classes.get(s.id)?.get(g.id)?.size ?? 0; return { href: `/giang-day/${s.id}/${g.id}${gv ? `?gv=${gv}` : ""}`, label: g.gradeName, count: n, unit: "lớp", disabled: n === 0 }; }),
        }))}
      />
    </div>
  );
}
