import Link from "next/link";
import { effectiveSlots } from "@/modules/scheduling/effective";
import { AutoForm } from "@/components/auto-form";
import { AssignmentRow } from "@/components/assignment-row";
import { db } from "@/lib/db";
import { MANAGER_ROLES, TEACHING_ROLES, requireRole } from "@/lib/guard";
import { Card, inputCls, Tabs, Title } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { fmtDate } from "@/lib/format";
import { currentTerm } from "@/lib/catalog";

export default async function Assignments({ searchParams }: { searchParams: Promise<{ tab?: string; term?: string; class?: string; teacher?: string; subject?: string; missing?: string; page?: string; size?: string }> }) {
  const user = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const canEdit = user.roles.some((role) => MANAGER_ROLES.includes(role)), isAdmin = user.roles.includes("ADMIN");
  const sp = await searchParams;
  const tab = canEdit && sp.tab === "history" ? "history" : "term";
  const pg = getPaging(sp, 12);
  const [current, terms, teachers, subjects] = await Promise.all([currentTerm(), db.academicTerm.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }), db.teacher.findMany({ where: { user: { isActive: true } }, orderBy: { fullName: "asc" } }), db.subject.findMany({ orderBy: { subjectName: "asc" } })]);
  const term = terms.find((item) => item.id === sp.term) ?? current ?? terms[0];
  const termId = term?.id ?? "__none__";
  const scope = { academicYear: { terms: { some: { id: termId } } } };
  const curriculumWhere = { ...(sp.subject ? { subjectId: sp.subject } : {}), ...(sp.missing === "1" ? { assignments: { none: { academicTermId: termId } } } : sp.teacher ? { assignments: { some: { academicTermId: termId, teacherId: sp.teacher } } } : {}) };
  const classWhere = { ...scope, ...(sp.class ? { id: sp.class } : {}), ...((sp.subject || sp.teacher || sp.missing) ? { subjects: { some: curriculumWhere } } : {}) };
  const [classOptions, total, classes, expected, assigned, missing] = await Promise.all([
    db.schoolClass.findMany({ where: scope, select: { id: true, className: true }, orderBy: { className: "asc" } }),
    db.schoolClass.count({ where: classWhere }),
    db.schoolClass.findMany({ where: classWhere, orderBy: { className: "asc" }, skip: pg.skip, take: pg.take, include: { subjects: { where: curriculumWhere, orderBy: { subject: { subjectName: "asc" } }, include: { subject: true, assignments: { where: { academicTermId: termId }, include: { teacher: true, _count: { select: { timetableSlots: { where: effectiveSlots() } } } } } } } } }),
    db.classSubject.count({ where: { schoolClass: scope } }),
    db.classSubjectAssignment.count({ where: { academicTermId: termId } }),
    db.classSubject.count({ where: { schoolClass: scope, assignments: { none: { academicTermId: termId } } } }),
  ]);
  const historyWhere = { targetType: "ClassSubjectAssignment", action: { startsWith: "change_teacher:" } };
  const [history, historyTotal] = tab === "history" ? await Promise.all([db.activityLog.findMany({ where: historyWhere, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take }), db.activityLog.count({ where: historyWhere })]) : [[], 0];
  const historyAssignments = history.length ? await db.classSubjectAssignment.findMany({ where: { id: { in: history.map((item) => item.targetId ?? "") } }, include: { schoolClass: true, subject: true } }) : [];
  const q = (nextTab: string) => `/phan-cong?${new URLSearchParams({ term: termId, tab: nextTab })}`;
  return <div className="space-y-4">
    <Title>Phân công giảng dạy</Title>
    <div className="grid grid-cols-3 gap-3"><Card><p className="text-xs text-slate-500">Môn của các lớp</p><b className="text-2xl">{expected}</b></Card><Card><p className="text-xs text-slate-500">Đã có giáo viên</p><b className="text-2xl">{assigned}</b></Card><Card><p className="text-xs text-slate-500">Cần phân công</p><b className="text-2xl text-amber-700">{missing}</b></Card></div>
    <Tabs current={q(tab)} items={canEdit ? [[q("term"), "Theo lớp & học kỳ"], [q("history"), "Lịch sử đổi giáo viên"]] : [[q("term"), "Theo lớp & học kỳ"]]} />
    {tab === "term" ? <>
      <p className="text-sm text-slate-500">Hiện sẵn các môn đã chọn trong thông tin lớp. Chọn giáo viên ngay tại môn còn trống.</p>
      <AutoForm className="flex flex-wrap gap-2" resets={{ term: ["class", "teacher", "subject", "missing"] }}><input type="hidden" name="tab" value="term" /><select name="term" aria-label="Học kỳ" defaultValue={termId} className={inputCls}>{terms.map((term) => <option key={term.id} value={term.id}>{term.termName} · {term.academicYear.yearName}</option>)}</select><select name="class" aria-label="Lớp" defaultValue={sp.class ?? ""} className={inputCls}><option value="">Tất cả lớp</option>{classOptions.map((cls) => <option key={cls.id} value={cls.id}>{cls.className}</option>)}</select><select name="subject" aria-label="Môn" defaultValue={sp.subject ?? ""} className={inputCls}><option value="">Tất cả môn</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.subjectName}</option>)}</select><select name="teacher" aria-label="Giáo viên" defaultValue={sp.teacher ?? ""} className={inputCls}><option value="">Tất cả giáo viên</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select><label className="flex items-center gap-2 text-sm"><input name="missing" type="checkbox" value="1" defaultChecked={sp.missing === "1"} />Chỉ môn thiếu giáo viên</label></AutoForm>
      {classes.map((cls) => <section key={cls.id} className="overflow-hidden rounded-lg border bg-white"><div className="flex items-center justify-between bg-slate-50 px-4 py-3"><Link href={`/lop-hoc/${cls.id}?tab=assignments`} className="font-semibold hover:text-orange-700">Lớp {cls.className}</Link>{canEdit && <Link href={`/lop-hoc/${cls.id}?tab=settings`} className="text-xs text-orange-700">Sửa môn học của lớp</Link>}</div><ul className="divide-y">{cls.subjects.map((row) => <AssignmentRow key={row.subjectId} classId={cls.id} className={cls.className} termId={termId} subject={row.subject} assignment={row.assignments[0] ?? null} teachers={teachers} canEdit={canEdit} isAdmin={isAdmin} />)}</ul>{!cls.subjects.length && <p className="p-4 text-sm text-slate-500">Chưa chọn môn học. Vào thông tin lớp để chọn các môn lớp học.</p>}</section>)}
      {!classes.length && <Card className="py-10 text-center text-sm text-slate-500">Không có lớp/môn phù hợp.</Card>}
      <Pagination path="/phan-cong" total={total} page={pg.page} size={pg.size} params={{ tab, term: termId, class: sp.class, subject: sp.subject, teacher: sp.teacher, missing: sp.missing, size: sp.size }} />
    </> : <><ul className="divide-y rounded-lg border bg-white">{history.map((item) => { const assignment = historyAssignments.find((row) => row.id === item.targetId); const [from, to] = item.action.replace("change_teacher:", "").split("->"); return <li key={item.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm"><span><b>{assignment ? `${assignment.schoolClass.className} · ${assignment.subject.subjectName}` : "Phân công đã gỡ"}</b>: {teachers.find((teacher) => teacher.id === from)?.fullName ?? from} → {teachers.find((teacher) => teacher.id === to)?.fullName ?? to}</span><span className="text-xs text-slate-500">{item.actorEmail} · {fmtDate(item.createdAt)}</span></li>; })}{!history.length && <li className="p-8 text-center text-sm text-slate-500">Chưa có thay đổi.</li>}</ul><Pagination path="/phan-cong" total={historyTotal} page={pg.page} size={pg.size} params={{ tab, term: termId }} /></>}
  </div>;
}
