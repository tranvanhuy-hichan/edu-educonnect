import { db } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Card, inputCls } from "@/components/ui";
import { setClassOfficer } from "@/app/(app)/lop-hoc/officer-actions";

export async function ClassOfficers({ classId, canManage }: { classId: string; canManage: boolean }) {
  const cls = await db.schoolClass.findUniqueOrThrow({ where: { id: classId }, include: { academicYear: true, monitorStudent: true,
    doanDepartment: { include: { secretary: true, monitors: { include: { user: true } } } } } });
  const [{ y }] = await db.$queryRaw<{ y: number }[]>`SELECT edu.cur_school_year() AS y`;
  const current = cls.academicYear.schoolYear === y;
  const d = current ? cls.doanDepartment : null;
  const candidates = d && canManage ? await db.doanMember.findMany({ where: { departmentId: d.id, status: "ACTIVE", user: { status: "ACTIVE" }, eduStudent: { enrollments: { some: { schoolClassId: classId } } } }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }) : [];
  return <Card className="space-y-3"><h2 className="font-semibold">Ban cán sự lớp</h2>
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-slate-500">Lớp trưởng</dt><dd>{cls.monitorStudent?.fullName ?? "Chưa phân công"}</dd></div>
      <div><dt className="text-slate-500">Bí thư</dt><dd>{d?.secretary?.fullName ?? (current ? "Chưa phân công" : "Không có dữ liệu lịch sử")}</dd></div>
      <div><dt className="text-slate-500">Cờ đỏ</dt><dd>{d?.monitors.map((m) => m.user.fullName).join(", ") || (current ? "Chưa phân công" : "Không có dữ liệu lịch sử")}</dd></div>
    </dl>
    {canManage && d && <div className="space-y-3 border-t pt-3">
      <p className="text-xs text-slate-500">Phân công dùng chung với Cổng Đoàn. Bí thư và cờ đỏ vẫn có quyền học sinh thông thường tại EduConnect.</p>
      {[["PRESIDENT", "Lớp trưởng"], ["SECRETARY", "Bí thư"], ["RED_MONITOR", "Cờ đỏ"]].map(([office, label]) => <div key={office}>
        <ActionForm action={setClassOfficer} submit={office === "RED_MONITOR" ? "Thêm cờ đỏ" : `Chọn ${label.toLowerCase()}`} className="flex flex-wrap items-center gap-2" reset={false}>
          <input type="hidden" name="classId" value={classId} /><input type="hidden" name="office" value={office} />
          <select required name="memberId" className={inputCls}><option value="">Chọn {label.toLowerCase()}</option>{candidates.map((m) => <option key={m.id} value={m.id}>{m.fullName} ({m.code})</option>)}</select>
        </ActionForm>
        {office !== "RED_MONITOR" && <ActionForm action={setClassOfficer} submit={`Bỏ ${label.toLowerCase()}`} compact ghost confirmText={`Bỏ phân công ${label.toLowerCase()}?`}><input type="hidden" name="classId" value={classId} /><input type="hidden" name="office" value={office} /><input type="hidden" name="remove" value="1" /></ActionForm>}
      </div>)}
      {d.monitors.map((m) => <ActionForm key={m.userId} action={setClassOfficer} submit={`Gỡ cờ đỏ: ${m.user.fullName}`} compact ghost><input type="hidden" name="classId" value={classId} /><input type="hidden" name="office" value="RED_MONITOR" /><input type="hidden" name="accountId" value={m.userId} /><input type="hidden" name="remove" value="1" /></ActionForm>)}
    </div>}
  </Card>;
}
