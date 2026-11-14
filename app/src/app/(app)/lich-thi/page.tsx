import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { isAdmin } from "@/lib/auth/session";
import { ActionMenu } from "@/components/action-menu";
import { MobileCollapse } from "@/components/mobile-collapse";
import { AutoForm } from "@/components/auto-form";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { Card, inputCls, Title } from "@/components/ui";
import { labelOf } from "@/lib/policy-schema";
import { getPolicy } from "@/lib/policy";
import { examListSelect, EXAM_STATUS } from "@/modules/exams/queries";
import { examStaff, examVisibility } from "@/modules/exams/service";
import { examTime } from "@/modules/exams/planning";
import { SearchableSelect } from "@/components/searchable-select";

export default async function Exams({ searchParams }: { searchParams: Promise<{ q?: string; grade?: string; subject?: string; status?: string; mine?: string; page?: string; size?: string }> }) {
  const user = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES, "STUDENT");
  const sp = await searchParams;
  const categories = (await getPolicy()).examCategories;
  const manager = isAdmin(user), staff = examStaff(user);
  const pg = getPaging(sp, 12);
  const where = { AND: [examVisibility(user), ...(sp.q ? [{ title: { contains: sp.q, mode: "insensitive" as const } }] : []), ...(sp.grade ? [{ gradeLevelId: sp.grade }] : []), ...(sp.subject ? [{ papers: { some: { subjectId: sp.subject } } }] : []), ...(manager && ["DRAFT", "PUBLISHED", "CANCELLED"].includes(sp.status ?? "") ? [{ status: sp.status as "DRAFT" | "PUBLISHED" | "CANCELLED" }] : []), ...(sp.mine === "1" && user.teacherId ? [{ papers: { some: { rooms: { some: { invigilators: { some: { teacherId: user.teacherId } } } } } } }] : [])] };
  const [events, total, grades, subjects] = await Promise.all([
    db.examEvent.findMany({ where, select: examListSelect(user), orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take }), db.examEvent.count({ where }),
    db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }), db.subject.findMany({ orderBy: { subjectName: "asc" } }),
  ]);
  return <div className="space-y-4">
    <Title actionsInline right={manager && <><div className="hidden md:block"><Link href="/lich-thi/them" className="rounded-md bg-coral-600 px-4 py-2 text-sm font-medium text-white">+ Tạo lịch thi</Link></div><div className="md:hidden"><ActionMenu label="Thao tác lịch thi"><Link href="/lich-thi/them" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-slate-50">Tạo lịch thi</Link></ActionMenu></div></>}>{staff ? "Lịch thi" : "Lịch thi của tôi"}</Title>
    <AutoForm className="flex flex-wrap gap-2">
      <input name="q" defaultValue={sp.q} placeholder="Tìm kỳ thi..." className={inputCls + " min-w-0 flex-1"} aria-label="Tìm kỳ thi" />
      <MobileCollapse active={[sp.grade, sp.subject, sp.status, sp.mine].filter(Boolean).length}>
      <SearchableSelect key={sp.grade ?? ""} name="grade" defaultValue={sp.grade ?? ""} emptyLabel="Tất cả khối" ariaLabel="Khối" className="w-full md:w-44" options={grades.map((grade) => ({ value: grade.id, label: grade.gradeName }))} />
      <SearchableSelect key={sp.subject ?? ""} name="subject" defaultValue={sp.subject ?? ""} emptyLabel="Tất cả môn" ariaLabel="Môn thi" className="w-full md:w-44" options={subjects.map((subject) => ({ value: subject.id, label: subject.subjectName }))} />
      {manager && <select name="status" defaultValue={sp.status ?? ""} className={inputCls} aria-label="Trạng thái"><option value="">Tất cả trạng thái</option>{Object.entries(EXAM_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
      {user.teacherId && <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} />Tôi coi thi</label>}
      </MobileCollapse>
    </AutoForm>
    <div className="grid gap-3 xl:grid-cols-2">{events.map((event) => <Card key={event.id} className="space-y-3">
      <div className="flex items-start justify-between gap-3"><Link href={`/lich-thi/${event.id}`} className="font-semibold text-orange-700 hover:underline">{event.title}</Link><span className={`rounded-full px-2 py-1 text-xs ${event.status === "PUBLISHED" ? "bg-green-100 text-green-800" : event.status === "CANCELLED" ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"}`}>{EXAM_STATUS[event.status]}</span></div>
      <p className="text-xs text-slate-500">{event.gradeLevel.gradeName} · {labelOf(categories, event.category)} · {event.academicTerm.termName} · {event.academicTerm.academicYear.yearName}</p>
      <ul className="space-y-2 text-sm">{event.papers.map((paper) => <li key={paper.id} className="rounded-md bg-slate-50 p-2"><div className="flex flex-wrap justify-between gap-2"><b>{paper.subject.subjectName}</b><span>{examTime(paper.startsAt)}</span></div><div className="mt-1 text-xs text-slate-500">{Math.round((paper.endsAt.getTime() - paper.startsAt.getTime()) / 60000)} phút · {paper.grouping === "CLASS" ? "Thi theo lớp" : "Chia alphabet"}{staff ? ` · ${paper._count.rooms} phòng` : paper.rooms.map((room) => ` · ${room.room?.roomName ?? "Chưa gán phòng"} · SBD ${room.seats[0]?.registrationNo} · Chỗ ${room.seats[0]?.seatNo}`).join("")}</div>{user.teacherId && paper.rooms.some((room) => room.invigilators.some((row) => row.teacherId === user.teacherId)) && <p className="mt-1 text-xs font-semibold text-orange-700">Bạn được phân công coi thi</p>}</li>)}</ul>
    </Card>)}</div>
    {!events.length && <Card className="py-10 text-center text-sm text-slate-500">{staff ? "Chưa có lịch thi phù hợp." : "Bạn chưa có lịch thi đã công bố."}</Card>}
    <Pagination path="/lich-thi" total={total} page={pg.page} size={pg.size} params={{ q: sp.q, grade: sp.grade, subject: sp.subject, status: sp.status, mine: sp.mine, size: sp.size }} />
  </div>;
}
