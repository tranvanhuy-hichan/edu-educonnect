import { loadScheduleSlots } from "@/modules/scheduling/schedule-slots";
import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { MANAGER_ROLES, requireRole } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls, Table, Tabs } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { currentTerm, hueOfStr, initialOf, rankOf } from "@/lib/catalog";
import { STATUS_COLOR, STATUS_LABEL, loadStudents } from "@/server/students";
import { StudentFields } from "../student-fields";
import { deleteStudent, resetParentPassword, resetStudentPassword, setStudentClass, toggleLocked, updateStudent } from "../actions";

const TABS = [["overview", "Tổng quan"], ["info", "Thông tin cá nhân"], ["classes", "Lớp & thời khóa biểu"], ["grades", "Bảng điểm"], ["loans", "Mượn sách"]] as const;

export default async function StudentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, "HOMEROOM_TEACHER", "SUBJECT_TEACHER");
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const isManager = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const [s] = await loadStudents({ id });
  if (!s) notFound();
  // Giáo viên chỉ xem học sinh thuộc lớp mình chủ nhiệm hoặc dạy
  if (!isManager) {
    const tid = me.teacherId;
    const classIds = s.enrollments.map((e) => e.schoolClassId);
    const ok = tid && (await db.schoolClass.count({ where: { id: { in: classIds }, OR: [{ homeroomTeacherId: tid }, { assignments: { some: { teacherId: tid } } }] } })) > 0;
    if (!ok) redirect("/");
  }
  const term = await currentTerm();
  const hue = hueOfStr(s.id);
  const base = `?tab=`;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-full text-xl font-bold" style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 25%)` }}>{initialOf(s.fullName)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{s.fullName}</h1><span className={`text-sm font-semibold ${STATUS_COLOR[s.status]}`}>{STATUS_LABEL[s.status]}</span></div>
            <div className="mt-1 text-sm text-slate-600">{s.code} · {s.user.email}{s.current ? ` · Lớp ${s.current.schoolClass.className}` : ""}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isManager && <ActionForm action={resetStudentPassword} submit="Cấp lại mật khẩu" compact reset={false} className="inline-flex"><input type="hidden" name="id" value={s.id} /></ActionForm>}
            {isManager && s.guardianPhone && (
              <ActionForm
                action={resetParentPassword}
                submit="Đặt lại MK Phụ huynh"
                compact
                reset={false}
                confirmText={`Đặt lại mật khẩu Sổ liên lạc của phụ huynh (SĐT: ${s.guardianPhone}) về 123456?`}
                className="inline-flex"
              >
                <input type="hidden" name="phone" value={s.guardianPhone} />
                <input type="hidden" name="fullName" value={s.guardianName ?? `Phụ huynh em ${s.fullName}`} />
              </ActionForm>
            )}
            {isManager && <ActionForm action={toggleLocked} submit={s.status === "locked" ? "Mở khóa" : "Khóa tài khoản"} compact danger={s.status !== "locked"} confirmText={s.status === "locked" ? undefined : "Khóa tài khoản học sinh này?"} reset={false} className="inline-flex"><input type="hidden" name="id" value={s.id} /></ActionForm>}
            {me.roles.includes("ADMIN") && <ActionForm action={deleteStudent} submit="Xoá" compact danger confirmText="Xoá hẳn học sinh này?" className="inline-flex"><input type="hidden" name="id" value={s.id} /></ActionForm>}
          </div>
        </div>
      </Card>
      <Tabs current={`${base}${tab}`} items={TABS.filter(([k]) => isManager || k !== "info").map(([k, l]) => [`${base}${k}`, l] as [string, string])} />

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-1.5 text-sm"><h2 className="font-semibold">Học tập</h2>
            <div className="flex justify-between"><span className="text-slate-500">Lớp năm nay</span><b>{s.current?.schoolClass.className ?? "Chưa xếp lớp"}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">GVCN</span><b>{s.current?.schoolClass.homeroomTeacher?.fullName ?? "-"}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Điểm TB {term?.termName ?? ""}</span><b>{s.gpa == null ? "-" : `${s.gpa.toFixed(2)} · ${rankOf(s.gpa)}`}</b></div>
          </Card>
          <Card className="space-y-1.5 text-sm"><h2 className="font-semibold">Phụ huynh</h2>
            <div className="flex justify-between"><span className="text-slate-500">Họ tên</span><b>{s.guardianName ?? "-"}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">SĐT</span><b>{s.guardianPhone ?? "-"}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Ngày sinh</span><b>{fmtDate(s.dob)}</b></div>
          </Card>
        </div>
      )}

      {tab === "info" && isManager && (
        <Card><ActionForm action={updateStudent} submit="Lưu thông tin" reset={false} className="flex flex-col gap-4 [&>button]:self-start"><input type="hidden" name="id" value={s.id} /><StudentFields editing s={{ fullName: s.fullName, dob: s.dob, guardianName: s.guardianName, guardianPhone: s.guardianPhone }} /></ActionForm></Card>
      )}

      {tab === "classes" && await (async () => {
        const [slots, classes] = await Promise.all([
          s.current && term ? loadScheduleSlots({ ...effectiveSlots(), schoolClassId: s.current.schoolClassId, academicTermId: term.id }) : Promise.resolve([]),
          isManager ? db.schoolClass.findMany({ where: { academicYear: { endDate: { gte: new Date() } } }, orderBy: { className: "asc" }, select: { id: true, className: true } }) : Promise.resolve([]),
        ]);
        const transfers = await db.classTransfer.findMany({ where: { studentId: id }, orderBy: { effectiveAt: "desc" } });
        const oldClasses = await db.schoolClass.findMany({ where: { id: { in: transfers.flatMap((transfer) => [transfer.fromClassId, transfer.toClassId]) } } });
        const className = new Map(oldClasses.map((cls) => [cls.id, cls.className]));
        return (
          <div className="space-y-4">
            <Card className="space-y-2"><h2 className="font-semibold">Lịch sử xếp lớp</h2><ul className="space-y-2 text-xs">{transfers.map((transfer) => <li key={transfer.id} className="rounded-lg border p-3"><b>{className.get(transfer.fromClassId) ?? transfer.fromClassId} → {className.get(transfer.toClassId) ?? transfer.toClassId}</b><p>Học lớp cũ: {transfer.fromDate ? fmtDate(transfer.fromDate) : "Chưa có mốc ngày từ dữ liệu cũ"} đến {fmtDate(transfer.effectiveAt)} (không bao gồm ngày chuyển). Lớp mới từ {fmtDate(transfer.effectiveAt)}.</p><p>{transfer.reason} · {transfer.decisionReference} · {transfer.actorEmail}</p></li>)}</ul>
              <ul className="divide-y text-sm">{s.enrollments.map((e) => <li key={e.id} className="flex justify-between py-2"><Link href={`/lop-hoc/${e.schoolClassId}`} className="font-medium hover:text-orange-700">{e.schoolClass.className}</Link><span className="text-slate-500">{e.academicYear.yearName}</span></li>)}{!s.enrollments.length && <li className="py-3 text-slate-500">Chưa xếp lớp.</li>}</ul>
              {isManager && <DialogButton variant="secondary" label={s.current ? "Đổi lớp năm nay" : "Xếp lớp"} title="Xếp lớp cho học sinh"><ActionForm action={setStudentClass} submit="Xếp lớp" className="flex flex-col gap-3 [&>button]:self-start"><input type="hidden" name="studentId" value={s.id} /><Field label="Lớp"><select name="classId" className={inputCls + " w-full"}><option value="">-- chọn lớp --</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.className}</option>)}</select></Field><Field label="Ngày hiệu lực"><input required type="date" name="effectiveDate" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })} className={inputCls + " w-full"} /></Field><Field label="Lý do"><input required minLength={5} name="reason" className={inputCls + " w-full"} /></Field><Field label="Số quyết định / căn cứ"><input required minLength={3} name="decisionReference" className={inputCls + " w-full"} /></Field></ActionForm></DialogButton>}
            </Card>
            <Table head={["Thứ", "Tiết", "Môn", "Giáo viên", "Phòng"]}>
              {slots.map((x) => <tr key={x.id}><td>Thứ {x.dayOfWeek}</td><td>{x.periodNo}</td><td>{x.assignment.subject.subjectName}</td><td>{x.assignment.teacher.fullName}</td><td>{x.room.roomName}</td></tr>)}
              {!slots.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa có thời khóa biểu.</td></tr>}
            </Table>
          </div>
        );
      })()}

      {tab === "grades" && await (async () => {
        const avgs = await db.subjectTermAverage.findMany({ where: { studentId: id, academicTermId: term?.id ?? "-" }, include: { assignment: { include: { subject: true } } }, orderBy: { assignment: { subject: { subjectName: "asc" } } } });
        return (
          <Table head={["Môn học", `Điểm TB ${term?.termName ?? ""}`, "Xếp loại"]}>
            {avgs.map((a) => <tr key={a.id}><td>{a.assignment.subject.subjectName}</td><td className="font-bold">{a.averageValue.toFixed(2)}</td><td>{rankOf(a.averageValue)}</td></tr>)}
            {!avgs.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Chưa có điểm.</td></tr>}
          </Table>
        );
      })()}

      {tab === "loans" && await (async () => {
        const loans = await db.libraryLoan.findMany({
          where: { studentId: id },
          orderBy: { borrowedDate: "desc" },
          include: {
            bookCopy: { include: { bookTitle: true } },
            items: { include: { bookCopy: { include: { bookTitle: true } } } },
          },
          take: 50,
        });
        return (
          <Table head={["Mã phiếu", "Sách mượn", "Ngày mượn", "Hạn trả", "Đã trả", "Trạng thái"]}>
            {loans.map((l) => {
              const bookNames = l.items?.length
                ? l.items.map((it) => `${it.bookCopy.bookTitle.title} (${it.bookCopy.copyCode})`).join(", ")
                : l.bookCopy ? `${l.bookCopy.bookTitle.title} (${l.bookCopy.copyCode})` : "Sách";
              return (
                <tr key={l.id}>
                  <td className="font-mono text-xs">{l.loanCode ?? "-"}</td>
                  <td className="font-medium">{bookNames}</td>
                  <td>{fmtDate(l.borrowedDate)}</td>
                  <td>{fmtDate(l.dueDate)}</td>
                  <td>{fmtDate(l.returnedDate) || "-"}</td>
                  <td>{l.status}</td>
                </tr>
              );
            })}
            {!loans.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Chưa mượn sách.</td></tr>}
          </Table>
        );
      })()}
    </div>
  );
}
