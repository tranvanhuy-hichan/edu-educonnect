import Link from "next/link";
import { ViewToggle, pickView } from "@/components/view-toggle";
import { AutoForm } from "@/components/auto-form";
import { db } from "@/lib/db";
import { MANAGER_ROLES, requireRole } from "@/lib/guard";
import { inputCls, Table, Tabs, Title } from "@/components/ui";
import { MobileCollapse } from "@/components/mobile-collapse";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { loadStudents, STATUS_COLOR, STATUS_LABEL, type StudentStatus } from "@/server/students";
import { hueOfStr, initialOf } from "@/lib/catalog";

const DOT: Record<StudentStatus, string> = { learning: "bg-green-500", waiting: "bg-sky-500", attention: "bg-red-500", locked: "bg-slate-400" };
const TABS: [string, string][] = [["all", "Tất cả"], ["learning", "Đang học"], ["waiting", "Chờ xếp lớp"], ["attention", "Cần quan tâm"], ["locked", "Đã khóa"]];
const SUB = (st: StudentStatus, gpa: number | null) => st === "waiting" ? "Chưa xếp lớp năm nay" : st === "locked" ? "Tài khoản đã khóa" : gpa != null ? `Điểm TB ${gpa.toFixed(2)}` : "Chưa có điểm";

export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; sort?: string; grade?: string; classId?: string; page?: string; size?: string; v?: string }> }) {
  await requireRole(...MANAGER_ROLES);
  const sp = await searchParams;
  const { q = "", tab = "all", sort = "az", grade = "", classId = "" } = sp;
  const view = pickView(sp.v, "table");
  const pg = getPaging(sp);
  const [all, grades, classes] = await Promise.all([
    loadStudents(), db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    db.schoolClass.findMany({ where: { academicYear: { endDate: { gte: new Date() } } }, orderBy: { className: "asc" }, select: { id: true, className: true, gradeLevelId: true } }),
  ]);
  const kw = q.toLowerCase();
  const base = all.filter((s) => (!classId || s.current?.schoolClassId === classId) && (!grade || s.current?.schoolClass.gradeLevelId === grade) && (!kw || `${s.fullName} ${s.code ?? ""} ${s.user.email}`.toLowerCase().includes(kw)));
  const counts: Record<string, number> = { all: base.length };
  for (const s of base) counts[s.status] = (counts[s.status] ?? 0) + 1;
  let list = base.filter((s) => tab === "all" || s.status === tab);
  if (sort === "za") list = [...list].reverse();
  if (sort === "new") list = [...list].sort((a, b) => b.user.createdAt.getTime() - a.user.createdAt.getTime());
  const shown = list.slice(pg.skip, pg.skip + pg.take);
  const params = { q, tab, sort, grade, classId, size: sp.size, v: sp.v };
  const link = (t: string) => `/hoc-sinh?tab=${t}&q=${encodeURIComponent(q)}&sort=${sort}&grade=${grade}&classId=${classId}`;

  const Card = ({ s }: { s: (typeof shown)[number] }) => {
    const st = s.status; const hue = hueOfStr(s.id);
    return (
      <Link href={`/hoc-sinh/${s.id}`} className={`block rounded-xl border bg-white p-3 shadow-sm transition-colors hover:border-orange-400 active:bg-slate-50 ${st === "locked" ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full text-base font-bold" style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 25%)` }}>{initialOf(s.fullName)}</span>
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{s.fullName}</div><div className="truncate text-xs text-slate-500">{s.code}</div></div>
          <span className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold ${STATUS_COLOR[st]}`}><i className={`inline-block size-2 rounded-full ${DOT[st]}`} />{STATUS_LABEL[st]}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">{s.current ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{s.current.schoolClass.className}</span> : null}<span className="text-xs text-slate-500">{SUB(st, s.gpa)}</span></div>
        {s.guardianName && <div className="mt-1.5 truncate text-xs text-slate-500">PH: {s.guardianName}{s.guardianPhone ? ` · ${s.guardianPhone}` : ""}</div>}
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <Title>Danh sách Học sinh</Title>
      <Tabs current={link(tab)} items={TABS.map(([k, l]) => [link(k), `${l} (${counts[k] ?? 0})`] as [string, string])} />
      <div className="flex flex-wrap items-center gap-2">
      <AutoForm className="contents">
        <input type="hidden" name="tab" value={tab} /><input type="hidden" name="v" value={view} />
        <input name="q" defaultValue={q} placeholder="Tìm theo tên, mã, email..." className={inputCls + " min-w-0 flex-1 md:min-w-48"} />
        <MobileCollapse active={[grade, classId, sort !== "az" ? sort : ""].filter(Boolean).length}>
          <select name="grade" defaultValue={grade} className={inputCls}><option value="">Tất cả khối</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.gradeName}</option>)}</select>
          <select name="classId" defaultValue={classId} className={inputCls + " max-w-56"}><option value="">Tất cả lớp</option>{classes.filter((c) => !grade || c.gradeLevelId === grade).map((c) => <option key={c.id} value={c.id}>{c.className}</option>)}</select>
          <select name="sort" defaultValue={sort} className={inputCls}><option value="az">Tên A-Z</option><option value="za">Tên Z-A</option><option value="new">Mới nhất</option></select>
        </MobileCollapse>
        <div className="hidden md:block"><ViewToggle path="/hoc-sinh" params={{ q, tab, sort, grade, classId, size: sp.size }} view={view} /></div>
      </AutoForm>
      <div className="ml-auto flex items-center gap-2"><Link href="/hoc-sinh/them" className="inline-flex h-9 items-center rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700">+ Thêm học sinh</Link></div>
      </div>
      {view !== "cards" && <div className="space-y-2 md:hidden">{shown.map((s) => <Card key={s.id} s={s} />)}{!shown.length && <p className="py-8 text-center text-sm text-slate-500">Không có học sinh phù hợp.</p>}</div>}
      {view === "table" ? (
        <div className="hidden md:block"><Table head={["Học sinh", "Trạng thái", "Lớp năm nay", "Phụ huynh"]}>
          {shown.map((s) => { const st = s.status; const hue = hueOfStr(s.id); return (
            <tr key={s.id} className={`align-middle [&>td]:!py-3 ${st === "locked" ? "opacity-60" : ""}`}>
              <td><div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 25%)` }}>{initialOf(s.fullName)}</span>
                <div className="min-w-0"><Link data-row href={`/hoc-sinh/${s.id}`} className="block truncate font-semibold hover:text-orange-700">{s.fullName}</Link><div className="truncate text-xs text-slate-500">{s.code} · {s.user.email}</div></div>
              </div></td>
              <td><div className={`flex items-center gap-2 text-sm font-semibold ${STATUS_COLOR[st]}`}><i className={`inline-block size-2 rounded-full ${DOT[st]}`} />{STATUS_LABEL[st]}</div><div className="mt-0.5 pl-4 text-xs text-slate-500">{SUB(st, s.gpa)}</div></td>
              <td>{s.current ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{s.current.schoolClass.className}</span> : <span className="text-slate-400">—</span>}</td>
              <td>{s.guardianName ? <><div className="truncate text-sm">{s.guardianName}</div><div className="text-xs text-slate-500">{s.guardianPhone}</div></> : <span className="text-slate-400">—</span>}</td>
            </tr>); })}
          {!shown.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Không có học sinh phù hợp.</td></tr>}
        </Table></div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4">{shown.map((s) => <Card key={s.id} s={s} />)}{!shown.length && <p className="text-sm text-slate-500">Không có học sinh phù hợp.</p>}</div>
      )}
      <Pagination total={list.length} page={pg.page} size={pg.size} path="/hoc-sinh" params={params} />
    </div>
  );
}
