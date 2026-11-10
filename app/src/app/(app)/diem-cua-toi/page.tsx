import { redirect } from "next/navigation";
import { AlertCircle, CalendarCheck, ClipboardList, School } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/guard";
import { AutoForm } from "@/components/auto-form";
import { Card, inputCls, Table, Title } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { CATS, bandOf } from "@/server/grades-stats";
import { currentTermId, termOptions } from "@/server/learning-scope";

const Stat = ({ icon: I, label, value, tone }: { icon: typeof School; label: string; value: React.ReactNode; tone: string }) => (
  <Card className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}><I className="size-4 sm:size-5" /></span><div className="min-w-0"><div className="text-xs leading-tight text-slate-500">{label}</div><div className="truncate text-lg font-bold sm:text-xl">{value}</div></div></Card>
);

export default async function MyGrades({ searchParams }: { searchParams: Promise<{ termId?: string }> }) {
  const me = await requireRole("STUDENT");
  if (!me.studentId) redirect("/");
  const sp = await searchParams;
  const terms = await termOptions();
  const termId = sp.termId === "all" ? undefined : terms.find((t) => t.id === sp.termId)?.id ?? currentTermId(terms) ?? undefined;
  const sid = me.studentId;

  const [assignments, entries, averages, subs] = await Promise.all([
    db.classSubjectAssignment.findMany({
      where: { schoolClass: { enrollments: { some: { studentId: sid } } }, ...(termId ? { academicTermId: termId } : {}) },
      include: { assessments: { where: { studentId: sid } }, subject: true, teacher: true, schoolClass: true, academicTerm: { include: { academicYear: true } } },
      orderBy: [{ academicTerm: { startDate: "desc" } }, { subject: { subjectName: "asc" } }],
    }),
    db.scoreEntry.findMany({ where: { studentId: sid, ...(termId ? { academicTermId: termId } : {}) }, orderBy: { createdAt: "asc" } }),
    db.subjectTermAverage.findMany({ where: { studentId: sid, ...(termId ? { academicTermId: termId } : {}) } }),
    db.assignmentSubmission.findMany({ where: { studentId: sid, ...(termId ? { exercise: { lessonPost: { assignment: { academicTermId: termId } } } } : {}) }, orderBy: { submittedAt: "desc" }, take: 30, include: { exercise: { include: { lessonPost: { include: { assignment: { include: { subject: true } } } } } } } }),
  ]);
  const cards = assignments.map((a) => {
    const es = entries.filter((e) => e.assignmentId === a.id);
    const avg = es.length && !a.assessments[0]?.isExempt && a.subject.assessmentType === "SCORE" ? averages.find((x) => x.assignmentId === a.id)?.averageValue ?? null : null;
    return { a, es, avg };
  });
  const graded = cards.filter((x) => x.avg != null);
  const avg = graded.length ? graded.reduce((s, x) => s + x.avg!, 0) / graded.length : null;
  const best = [...graded].sort((x, y) => y.avg! - x.avg!)[0];
  const gradedWork = subs.filter((s) => s.grade != null).length;



  return (
    <div className="space-y-4">
      <Title>Bảng điểm của tôi</Title>
      <AutoForm className="flex flex-wrap items-center gap-2">
        <select name="termId" defaultValue={termId ?? "all"} className={inputCls}><option value="all">Tất cả học kỳ</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      </AutoForm>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={School} label="Môn có điểm" value={graded.length} tone="bg-orange-100 text-orange-700" />
        <Stat icon={AlertCircle} label="Điểm trung bình (thang 10)" value={avg != null ? avg.toFixed(2) : "-"} tone="bg-green-100 text-green-700" />
        <Stat icon={CalendarCheck} label="Điểm cao nhất" value={best ? `${best.avg!.toFixed(2)} · ${best.a.subject.subjectName}` : "-"} tone="bg-sky-100 text-sky-700" />
        <Stat icon={ClipboardList} label="Bài tập đã chấm" value={gradedWork} tone="bg-yellow-100 text-yellow-700" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map(({ a, es, avg: m }) => {
          const review = a.assessments[0];
          const nonNumeric = a.subject.assessmentType === "COMMENT" || review?.isExempt;
          const band = m != null && !nonNumeric ? bandOf(m) : null;
          const outcome = review?.isExempt ? "Miễn đánh giá" : review?.outcome === "DAT" ? "Đạt" : review?.outcome === "CHUA_DAT" ? "Chưa đạt" : "Chưa đánh giá";
          const tx = es.filter((e) => e.scoreType === "THUONG_XUYEN");
          const boxes = [...tx.map((e, i) => ({ k: `tx${i}`, name: `TX ${i + 1}`, v: e.value })), ...CATS.slice(1).map((c) => ({ k: c.key, name: c.name, v: es.find((e) => e.scoreType === c.key)?.value }))];
          return (
            <Card key={a.id} className="space-y-4">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                <div className="min-w-0 break-words"><div className="text-base font-semibold">{a.subject.subjectName}</div><div className="text-xs text-slate-500">GV: {a.teacher.fullName} · {a.academicTerm.termName} · {a.academicTerm.academicYear.yearName}</div></div>
                <div className="min-w-0 break-words sm:text-right"><div className="text-2xl font-bold leading-none" style={{ color: band?.color }}>{nonNumeric ? outcome : m != null ? m.toFixed(1) : "-"}</div><div className="mt-1 text-xs font-medium" style={{ color: band?.color }}>{nonNumeric ? review?.comment : "Điểm TB tạm tính"}</div></div>
              </div>
              {!nonNumeric && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {boxes.map((b) => (
                  <div key={b.k} className="rounded-md border p-2.5">
                    <div className="truncate text-xs text-slate-500">{b.name}</div>
                    <div className="text-lg font-bold">{b.v ?? "-"}<span className="text-xs font-normal text-slate-400">/10</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${b.v != null ? Math.min(100, (b.v / 10) * 100) : 0}%`, background: b.v != null ? bandOf(b.v).color : undefined }} /></div>
                  </div>
                ))}
              </div>}
            </Card>
          );
        })}
        {!cards.length && <Card className="py-10 text-center text-sm text-slate-500 xl:col-span-2">Chưa có môn học nào trong học kỳ này.</Card>}
      </div>

      <Card className="p-0">
        <div className="border-b px-4 py-3"><h2 className="font-semibold">Bài tập đã nộp</h2></div>
        <Table head={["Bài tập", "Môn", "Nộp lúc", "Điểm", "Nhận xét"]} bare>
          {subs.map((s) => (
            <tr key={s.id}>
              <td className="font-medium">{s.exercise.title}<div className="text-xs font-normal text-slate-500">{s.exercise.lessonPost.title}</div></td><td>{s.exercise.lessonPost.assignment.subject.subjectName}</td><td>{fmtDate(s.submittedAt)}</td>
              <td>{s.grade != null ? <b style={{ color: bandOf(s.grade).color }}>{s.grade}</b> : <span className="text-slate-400">Chưa chấm</span>}</td><td>{s.feedback ?? "-"}</td>
            </tr>
          ))}
          {!subs.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa nộp bài tập nào.</td></tr>}
        </Table>
      </Card>
    </div>
  );
}
