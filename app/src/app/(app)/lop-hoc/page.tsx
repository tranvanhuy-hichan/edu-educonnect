import Link from "next/link";
import { SearchableSelect } from "@/components/searchable-select";
import { ActionMenu } from "@/components/action-menu";
import { AutoForm } from "@/components/auto-form";
import { db } from "@/lib/db";
import { MANAGER_ROLES, TEACHING_ROLES, requireRole } from "@/lib/guard";
import { inputCls, Table, Title } from "@/components/ui";
import { ViewToggle } from "@/components/view-toggle";
import { MobileCollapse } from "@/components/mobile-collapse";
import { ClassCard } from "./class-card";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { todayUTC } from "@/lib/format";
import { Crown } from "lucide-react";

export default async function Classes({ searchParams }: { searchParams: Promise<{ q?: string; all?: string; v?: string; grade?: string; year?: string; teacher?: string; page?: string; size?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const canEdit = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const sp = await searchParams;
  const { q, all, grade, year, teacher, v = "cards" } = sp;
  const pg = getPaging(sp, v === "cards" ? 12 : 15);
  const today = todayUTC();
  const where = {
    ...(q ? { className: { contains: q, mode: "insensitive" as const } } : {}),
    ...(grade ? { gradeLevelId: grade } : {}), ...(year ? { academicYearId: year } : {}), ...(teacher ? { homeroomTeacherId: teacher } : {}),
    ...(all || year ? {} : { academicYear: { endDate: { gte: today } } }),
  };
  const [total, rows, grades, years, teachers] = await Promise.all([
    db.schoolClass.count({ where }),
    db.schoolClass.findMany({
      where, orderBy: [{ academicYear: { startDate: "desc" } }, { className: "asc" }], skip: pg.skip, take: pg.take,
      select: { id: true, className: true, shift: true, gradeLevel: { select: { gradeName: true } }, homeroomTeacher: { select: { id: true, fullName: true } }, academicYear: { select: { yearName: true, startDate: true, endDate: true } }, room: { select: { roomName: true } }, monitorStudent: { select: { fullName: true } }, _count: { select: { enrollments: true } } },
    }),
    db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    db.academicYear.findMany({ orderBy: { startDate: "desc" } }),
    db.teacher.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
  ]);
  const classes = rows.map((c) => ({ c: { id: c.id, className: c.className, gradeLevel: c.gradeLevel, homeroomTeacher: c.homeroomTeacher, academicYear: c.academicYear, shift: c.shift, room: c.room, monitor: c.monitorStudent }, students: c._count.enrollments }));
  const params = { q, all, v, grade, year, teacher, size: sp.size };

  return (
    <div className="design-sample class-directory space-y-4">
      <Title actionsInline right={canEdit ? <><div className="hidden md:block"><Link href="/lop-hoc/them" className="inline-flex h-9 items-center rounded-md bg-coral-600 px-4 text-sm font-medium text-white hover:bg-coral-700">+ Thêm lớp học</Link></div><div className="md:hidden"><ActionMenu label="Thao tác lớp học"><Link href="/lop-hoc/them" className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-slate-50">Thêm lớp học</Link></ActionMenu></div></> : undefined}>Danh sách lớp <span className="sample-count ml-1 inline-flex align-middle text-sm">{total}</span></Title>
      <AutoForm className="sample-toolbar flex flex-wrap items-center gap-2">
        <input type="hidden" name="v" value={v} />
        <input name="q" defaultValue={q} placeholder="Tìm lớp học..." className={inputCls + " min-w-48 flex-1 max-md:w-full max-md:basis-full"} />
        <MobileCollapse active={[grade, year, teacher, all].filter(Boolean).length}>
          <SearchableSelect key={grade ?? ""} name="grade" defaultValue={grade ?? ""} emptyLabel="Tất cả khối" ariaLabel="Khối" className="w-full md:w-44" options={grades.map((g) => ({ value: g.id, label: g.gradeName }))} />
          <SearchableSelect key={year ?? ""} name="year" defaultValue={year ?? ""} emptyLabel="Năm học hiện tại" ariaLabel="Năm học" className="w-full md:w-44" options={years.map((y) => ({ value: y.id, label: y.yearName }))} />
          <SearchableSelect key={teacher ?? ""} name="teacher" defaultValue={teacher ?? ""} emptyLabel="Tất cả GVCN" ariaLabel="Giáo viên chủ nhiệm" className="w-full md:w-52" options={teachers.map((t) => ({ value: t.id, label: t.fullName }))} />
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm max-md:flex-1 max-md:justify-center has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"><input type="checkbox" name="all" value="1" defaultChecked={!!all} /> Gồm lớp năm học cũ</label>
          <ViewToggle path="/lop-hoc" params={{ q, all, grade, year, teacher, size: sp.size }} view={v === "cards" ? "cards" : "table"} />
        </MobileCollapse>


      </AutoForm>

      {(q || grade || year || teacher || all) && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label="Bộ lọc đang áp dụng">
        <span className="sample-muted">Đang lọc:</span>
        {[q && `“${q}”`, grades.find((g) => g.id === grade)?.gradeName, years.find((y) => y.id === year)?.yearName, teachers.find((t) => t.id === teacher)?.fullName, all && "Gồm năm cũ"].filter(Boolean).map((label, index) => <span key={index} className="sample-filter-tag rounded px-2 py-1">{label}</span>)}
        <Link href={`/lop-hoc?v=${v === "cards" ? "cards" : "table"}`} className="sample-brand-link inline-flex min-h-9 items-center px-1 font-medium hover:underline">Xóa bộ lọc</Link>
      </div>}

      {v !== "cards" && (
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {classes.map((x) => <ClassCard key={x.c.id} c={x.c} students={x.students} />)}
          {!classes.length && <p className="py-8 text-center text-sm text-slate-500">Chưa có lớp học.</p>}
        </div>
      )}
      {v !== "cards" ? (
        <div className="hidden md:block"><Table head={["Lớp", "Ca học", "Phòng học", "GVCN", "Khối", "Niên khóa", "Sĩ số", "Lớp trưởng"]}>
          {classes.map(({ c, students }) => (
            <tr key={c.id} className="align-middle [&>td]:!py-3.5">
              <td className="min-w-32"><Link data-row href={`/lop-hoc/${c.id}`} className="text-base font-semibold text-orange-700 hover:underline">{c.className}</Link></td>
              <td className="whitespace-nowrap">
                {c.shift === "MORNING" ? (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">Ca sáng</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">Ca chiều</span>
                )}
              </td>
              <td className="whitespace-nowrap font-medium text-slate-700">{c.room?.roomName ?? <span className="text-slate-400 font-normal">Chưa có</span>}</td>
              <td className="min-w-44">{c.homeroomTeacher?.fullName ?? <span className="text-slate-400">Chưa có</span>}</td>
              <td className="whitespace-nowrap">{c.gradeLevel.gradeName}</td>
              <td className="whitespace-nowrap">{c.academicYear.yearName}</td>
              <td className="whitespace-nowrap"><b className="text-base">{students}</b> <span className="text-xs text-slate-500">học sinh</span></td>
              <td className="min-w-44">{c.monitor ? <span className="inline-flex items-center gap-1.5 font-medium"><Crown className="size-4 text-orange-600" />{c.monitor.fullName}</span> : <span className="text-slate-400">Chưa chọn</span>}</td>
            </tr>
          ))}
          {!classes.length && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Chưa có lớp học.</td></tr>}
        </Table></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((x) => <ClassCard key={x.c.id} c={x.c} students={x.students} />)}
          {!classes.length && <p className="text-sm text-slate-500">Chưa có lớp học.</p>}
        </div>
      )}
      <Pagination total={total} page={pg.page} size={pg.size} path="/lop-hoc" params={params} />
    </div>
  );
}
