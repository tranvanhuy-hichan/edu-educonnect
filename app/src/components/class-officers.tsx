import Link from "next/link";
import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Card } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { hueOfStr, initialOf } from "@/lib/catalog";
import { setAcademicDeputy, setClassOfficer, setHomeroomTeacher } from "@/app/(app)/lop-hoc/officer-actions";

const NONE = "Chưa phân công";

function Avatar({ name, size = "size-9" }: { name: string; size?: string }) {
  const hue = hueOfStr(name);
  return <span className={`grid ${size} shrink-0 place-items-center rounded-full text-sm font-bold`} style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 25%)` }}>{initialOf(name)}</span>;
}

function Person({ name, href, empty = NONE }: { name?: string | null; href?: string; empty?: string }) {
  if (!name) return <span className="text-sm text-slate-400">{empty}</span>;
  return <span className="flex min-w-0 items-center gap-2"><Avatar name={name} />{href ? <Link href={href} className="text-sm font-medium hover:text-orange-700">{name}</Link> : <span className="text-sm font-medium">{name}</span>}</span>;
}

async function loadOfficers(classId: string) {
  const cls = await db.schoolClass.findUniqueOrThrow({ where: { id: classId }, include: { academicYear: true, monitorStudent: true, academicDeputies: { include: { student: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "asc" } }, homeroomTeacher: { select: { id: true, fullName: true } },
    doanDepartment: { include: { secretary: true, monitors: { include: { user: true } } } } } });
  const [{ y }] = await db.$queryRaw<{ y: number }[]>`SELECT edu.cur_school_year() AS y`;
  const current = cls.academicYear.schoolYear === y;
  return { cls, current, d: current ? cls.doanDepartment : null };
}

/** Tóm tắt (chỉ xem) ở tab Tổng quan. */
export async function OfficersSummary({ classId }: { classId: string }) {
  const { cls, current, d } = await loadOfficers(classId);
  const none = current ? NONE : "Không có dữ liệu lịch sử";
  const Cell = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="min-w-0 space-y-1.5"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>{children}</div>;
  return <Card className="space-y-3 p-4">
    <div className="flex items-center justify-between"><h2 className="font-semibold">Nhân sự lớp</h2><Link href="?tab=personnel" className="text-sm text-orange-700 hover:underline">Xem chi tiết →</Link></div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Cell label="GVCN"><Person name={cls.homeroomTeacher?.fullName} href={cls.homeroomTeacher ? `/giao-vien/${cls.homeroomTeacher.id}` : undefined} /></Cell>
      <Cell label="Lớp trưởng"><Person name={cls.monitorStudent?.fullName} empty={none} /></Cell>
      <Cell label="Lớp phó học tập">{cls.academicDeputies.length ? <div className="space-y-1.5">{cls.academicDeputies.map((x) => <Person key={x.id} name={x.student.fullName} />)}</div> : <span className="text-sm text-slate-400">{none}</span>}</Cell>
      <Cell label="Bí thư"><Person name={d?.secretary?.fullName} empty={none} /></Cell>
      <Cell label="Cờ đỏ">{d?.monitors.length ? <div className="space-y-1.5">{d.monitors.map((m) => <Person key={m.userId} name={m.user.fullName} />)}</div> : <span className="text-sm text-slate-400">{none}</span>}</Cell>
    </div>
  </Card>;
}

/** Tab Nhân sự: GVCN (ADMIN chỉnh), GVBM (theo phân công kỳ hiện tại), ban cán sự (ADMIN/GVCN chỉnh). */
export async function ClassPersonnel({ classId, termId, isAdmin, canManage }: { classId: string; termId: string; isAdmin: boolean; canManage: boolean }) {
  const [assignments, teachers] = await Promise.all([
    db.classSubjectAssignment.findMany({ where: { schoolClassId: classId, academicTermId: termId }, include: { subject: true, teacher: true }, orderBy: { subject: { subjectName: "asc" } } }),
    isAdmin ? db.teacher.findMany({ where: { user: { isActive: true } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : Promise.resolve([]),
  ]);
  const { cls } = await loadOfficers(classId);
  return <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-semibold">Giáo viên chủ nhiệm</h2>
        <Person name={cls.homeroomTeacher?.fullName} href={cls.homeroomTeacher ? `/giao-vien/${cls.homeroomTeacher.id}` : undefined} />
        {isAdmin && <ActionForm action={setHomeroomTeacher} submit="Lưu" reset={false} className="flex items-center gap-2 border-t pt-3 [&>button]:shrink-0">
          <input type="hidden" name="classId" value={classId} />
          <div className="min-w-0 flex-1"><SearchableSelect name="teacherId" defaultValue={cls.homeroomTeacherId ?? ""} emptyLabel="-- chưa phân công --" ariaLabel="Giáo viên chủ nhiệm" className="w-full" options={teachers.map((t) => ({ value: t.id, label: t.fullName }))} /></div>
        </ActionForm>}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Giáo viên bộ môn <span className="text-sm font-normal text-slate-500">({assignments.length})</span></h2>
        {assignments.length ? <ul className="divide-y text-sm">{assignments.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 py-2"><span className="text-slate-500">{a.subject.subjectName}</span><Link href={`/giao-vien/${a.teacher.id}`} className="truncate font-medium hover:text-orange-700">{a.teacher.fullName}</Link></li>)}</ul> : <p className="text-sm text-slate-500">Chưa có phân công giảng dạy trong học kỳ hiện tại.</p>}
      </Card>
    </div>
    <ClassOfficers classId={classId} canManage={canManage} />
  </div>;
}

export async function ClassOfficers({ classId, canManage }: { classId: string; canManage: boolean }) {
  const { cls, current, d } = await loadOfficers(classId);
  const none = current ? NONE : "Không có dữ liệu lịch sử";
  const candidates = d && canManage ? await db.doanMember.findMany({ where: { departmentId: d.id, status: "ACTIVE", user: { status: "ACTIVE" }, eduStudent: { enrollments: { some: { schoolClassId: classId } } } }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }) : [];
  const enrolled = canManage ? await db.studentClassEnrollment.findMany({ where: { schoolClassId: classId, studentId: { notIn: cls.academicDeputies.map((x) => x.studentId) } }, select: { student: { select: { id: true, fullName: true, code: true } } }, orderBy: { student: { fullName: "asc" } } }) : [];
  const deputyOpts = enrolled.map((e) => ({ value: e.student.id, label: e.student.fullName, subtext: e.student.code ?? undefined }));
  const opts = candidates.map((m) => ({ value: m.id, label: m.fullName, subtext: m.code ?? undefined }));
  const hidden = (office: string) => <><input type="hidden" name="classId" value={classId} /><input type="hidden" name="office" value={office} /></>;
  const Slot = ({ office, label, holder }: { office: "PRESIDENT" | "SECRETARY"; label: string; holder?: string | null }) => (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1.5"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="flex items-center justify-between gap-2"><div className="min-w-0 flex-1"><Person name={holder} empty={none} /></div>
          {canManage && d && holder && <ActionForm action={setClassOfficer} submit="Bỏ" compact danger className="shrink-0" confirmText={`Bỏ phân công ${label.toLowerCase()}?`}>{hidden(office)}<input type="hidden" name="remove" value="1" /></ActionForm>}
        </div>
      </div>
      {canManage && d && <ActionForm action={setClassOfficer} submit={holder ? "Đổi" : "Chọn"} reset={false} className="flex items-center gap-2 border-t pt-3 [&>button]:shrink-0">
        {hidden(office)}<div className="min-w-0 flex-1"><SearchableSelect name="memberId" required emptyLabel={`-- chọn ${label.toLowerCase()} --`} ariaLabel={label} className="w-full" options={opts} /></div>
      </ActionForm>}
    </div>
  );
  return <Card className="space-y-3">
    <h2 className="font-semibold">Ban cán sự lớp</h2>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Slot office="PRESIDENT" label="Lớp trưởng" holder={cls.monitorStudent?.fullName} />
      <div className="space-y-3 rounded-lg border p-3">
        <div className="space-y-1.5"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Lớp phó học tập</div>
          {cls.academicDeputies.length ? <ul className="space-y-1.5">{cls.academicDeputies.map((x) => <li key={x.id} className="flex items-center justify-between gap-2"><div className="min-w-0 flex-1"><Person name={x.student.fullName} /></div>
            {canManage && <ActionForm action={setAcademicDeputy} submit="Gỡ" compact danger className="shrink-0"><input type="hidden" name="classId" value={classId} /><input type="hidden" name="studentId" value={x.studentId} /><input type="hidden" name="remove" value="1" /></ActionForm>}</li>)}</ul> : <span className="text-sm text-slate-400">{NONE}</span>}
        </div>
        {canManage && <ActionForm action={setAcademicDeputy} submit="Thêm" reset={false} className="flex items-center gap-2 border-t pt-3 [&>button]:shrink-0">
          <input type="hidden" name="classId" value={classId} /><div className="min-w-0 flex-1"><SearchableSelect name="studentId" required emptyLabel="-- thêm lớp phó học tập --" ariaLabel="Lớp phó học tập" className="w-full" options={deputyOpts} /></div>
        </ActionForm>}
      </div>
      <Slot office="SECRETARY" label="Bí thư" holder={d?.secretary?.fullName} />
      <div className="space-y-3 rounded-lg border p-3">
        <div className="space-y-1.5"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Cờ đỏ</div>
          {d?.monitors.length ? <ul className="space-y-1.5">{d.monitors.map((m) => <li key={m.userId} className="flex items-center justify-between gap-2"><div className="min-w-0 flex-1"><Person name={m.user.fullName} /></div>
            {canManage && <ActionForm action={setClassOfficer} submit="Gỡ" compact danger className="shrink-0">{hidden("RED_MONITOR")}<input type="hidden" name="accountId" value={m.userId} /><input type="hidden" name="remove" value="1" /></ActionForm>}</li>)}</ul> : <span className="text-sm text-slate-400">{none}</span>}
        </div>
        {canManage && d && <ActionForm action={setClassOfficer} submit="Thêm" reset={false} className="flex items-center gap-2 border-t pt-3 [&>button]:shrink-0">
          {hidden("RED_MONITOR")}<div className="min-w-0 flex-1"><SearchableSelect name="memberId" required emptyLabel="-- thêm cờ đỏ --" ariaLabel="Cờ đỏ" className="w-full" options={opts} /></div>
        </ActionForm>}
      </div>
    </div>
    {canManage && d && <p className="text-xs text-slate-500">Phân công dùng chung với Cổng Đoàn. Bí thư và cờ đỏ vẫn có quyền học sinh thông thường tại EduConnect.</p>}
  </Card>;
}
