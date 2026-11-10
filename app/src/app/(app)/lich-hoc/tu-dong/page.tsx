import Link from "next/link";
import { db } from "@/lib/db";
import { parseDate } from "@/lib/format";
import { requireRole, MANAGER_ROLES } from "@/lib/guard";
import { AutoForm } from "@/components/auto-form";
import { ScheduleBuilder } from "@/components/schedule-builder";
import { Card, inputCls, Title } from "@/components/ui";
import { listTerms } from "@/modules/scheduling/scheduling.repository";
import { loadAutoScheduleInput } from "@/modules/scheduling/scheduling.service";
import { scheduleOptionsSchema } from "@/modules/scheduling/options";

export default async function AutoSchedulePage({ searchParams }: { searchParams: Promise<{ term?: string; w?: string }> }) {
  await requireRole(...MANAGER_ROLES);
  const sp = await searchParams;
  const terms = await listTerms();
  const term = terms.find((term) => term.id === sp.term) ?? terms[0] ?? null;
  if (!term) return <div className="space-y-4"><Title>Tạo thời khóa biểu mới</Title><Card>Chưa có học kỳ nào. Tạo học kỳ ở mục Cấu hình trước.</Card></div>;
  const { classes, grades } = await loadAutoScheduleInput(term.id);
  const subjects = [...new Map(classes.flatMap((cls) => cls.subjects.map((row) => [row.subjectId, row.subject] as const))).values()];
  const previous = await db.timetableVersion.findFirst({ where: { academicTermId: term.id }, orderBy: { startsOn: "desc" }, select: { settings: true } });
  const initial = scheduleOptionsSchema.safeParse(previous?.settings);
  const selected = sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) && !Number.isNaN(parseDate(sp.w).getTime()) ? parseDate(sp.w) : undefined;
  return <div className="space-y-4">
    <Title right={<Link href={`/lich-hoc?term=${term.id}`} className="text-sm text-orange-700 hover:underline">Quay lại thời khóa biểu</Link>}>Tạo thời khóa biểu mới</Title>
    <AutoForm className="flex flex-wrap gap-2"><select name="term" defaultValue={term.id} className={inputCls} aria-label="Học kỳ">{terms.map((term) => <option key={term.id} value={term.id}>{term.termName} · {term.academicYear.yearName}</option>)}</select></AutoForm>
    <ScheduleBuilder key={term.id} term={term} grades={grades} classes={classes.map((cls) => ({ id: cls.id, className: cls.className, gradeLevelId: cls.gradeLevelId, shift: cls.shift, subjectIds: cls.subjects.map((row) => row.subjectId) }))} subjects={subjects} initial={initial.success ? initial.data : undefined} selected={selected} />
  </div>;
}
