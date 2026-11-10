import Link from "next/link";
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
      include: { gradeLevel: true, homeroomTeacher: true, academicYear: true, room: true, monitorStudent: { select: { fullName: true } }, _count: { select: { enrollments: true } } },
    }),
    db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    db.academicYear.findMany({ orderBy: { startDate: "desc" } }),
    db.teacher.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
  ]);
  const classes = rows.map((c) => ({ c: { id: c.id, className: c.className, gradeLevel: c.gradeLevel, homeroomTeacher: c.homeroomTeacher, academicYear: c.academicYear, shift: c.shift, room: c.room, monitor: c.monitorStudent }, students: c._count.enrollments }));
  const params = { q, all, v, grade, year, teacher, size: sp.size };

  return (
    <div className="space-y-4">
      <Title right={canEdit ? <Link href="/lop-hoc/them" className="inline-flex h-9 items-center rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700">+ Thêm lớp học</Link> : undefined}>Danh sách Lớp học ({total})</Title>
      <AutoForm className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="v" value={v} />
        <input name="q" defaultValue={q} placeholder="Tìm lớp học..." className={inputCls + " min-w-48 flex-1 max-md:w-full max-md:basis-full"} />
        <MobileCollapse active={[grade, year, teacher].filter(Boolean).length}>
          <select name="grade" defaultValue={grade ?? ""} className={inputCls}><option value="">Tất cả khối</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.gradeName}</option>)}</select>
          <select name="year" defaultValue={year ?? ""} className={inputCls}><option value="">Năm học hiện tại</option>{years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}</select>
          <select name="teacher" defaultValue={teacher ?? ""} className={inputCls + " max-w-56"}><option value="">Tất cả GVCN</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select>
        </MobileCollapse>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm max-md:flex-1 max-md:justify-center has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"><input type="checkbox" name="all" value="1" defaultChecked={!!all} /> Gồm lớp năm học cũ</label>
        <div className="hidden md:block"><ViewToggle path="/lop-hoc" params={{ q, all, grade, year, teacher, size: sp.size }} view={v === "cards" ? "cards" : "table"} /></div>
      </AutoForm>

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
