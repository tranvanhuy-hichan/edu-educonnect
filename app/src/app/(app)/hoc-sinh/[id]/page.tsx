import { loadScheduleSlots } from "@/modules/scheduling/schedule-slots";
import { SearchableSelect } from "@/components/searchable-select";
import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { BookOpen, CalendarX, ClipboardList, GraduationCap } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { MANAGER_ROLES, requireRole } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls, Table, Tabs } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getPolicy } from "@/lib/policy";
import { currentTerm, hueOfStr, initialOf, rankOf } from "@/lib/catalog";
import { AutoForm } from "@/components/auto-form";
import { PERIOD_OPTIONS, resolvePeriod } from "@/server/year-period";
import { buildYearRows, meanOf } from "@/modules/scoring/year-view";
import { currentTermId, termOptions } from "@/server/learning-scope";
import { STATUS_COLOR, STATUS_LABEL, loadStudents } from "@/server/students";
import { StudentFields } from "../student-fields";
import { deleteStudent, resetParentPassword, resetStudentPassword, setStudentClass, toggleLocked, updateStudent } from "../actions";

const GENDER: Record<string, string> = { MALE: "Nam", FEMALE: "Nữ", OTHER: "Khác" };
const TABS = [["overview", "Tổng quan"], ["info", "Thông tin cá nhân"], ["classes", "Lớp & thời khóa biểu"], ["grades", "Bảng điểm"], ["loans", "Mượn sách"]] as const;

export default async function StudentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; yearId?: string; period?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, "HOMEROOM_TEACHER", "SUBJECT_TEACHER");
  const policy = await getPolicy();
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
      <Card mobile="flat" className="space-y-3">
        <div className="detail-header flex flex-wrap items-start gap-3">
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

      {tab === "overview" && await (async () => {
        const cls = s.current?.schoolClass;
        const inTerm = term && cls ? { lessonPost: { assignment: { schoolClassId: cls.id, academicTermId: term.id } } } : null;
        const [absences, exTotal, exDone, borrowing] = await Promise.all([
          term ? db.classPeriodAbsence.findMany({ where: { studentId: id, log: { timetableSlot: { academicTermId: term.id } } }, select: { excused: true } }) : Promise.resolve([]),
          inTerm ? db.exercise.count({ where: inTerm }) : Promise.resolve(0),
          inTerm ? db.assignmentSubmission.count({ where: { studentId: id, exercise: inTerm } }) : Promise.resolve(0),
          db.libraryLoan.count({ where: { studentId: id, status: { in: ["BORROWED", "OVERDUE", "PARTIALLY_RETURNED"] } } }),
        ]);
        const excused = absences.filter((a) => a.excused).length;
        const stat = (Icon: typeof GraduationCap, label: string, value: React.ReactNode, sub?: string, tone = "bg-orange-100 text-orange-700") => (
          <Card className="flex items-center gap-3 p-4"><span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-5" /></span><div className="min-w-0"><div className="text-xs text-slate-500">{label}</div><div className="truncate text-lg font-semibold leading-tight">{value}</div>{sub && <div className="truncate text-xs text-slate-500">{sub}</div>}</div></Card>
        );
        // Chỉ hiện mục đã có thông tin; nếu còn thiếu thì nhắc bổ sung (tab Thông tin cá nhân)
        const facts = (rows: [string, React.ReactNode][]) => {
          const filled = rows.filter(([, v]) => v != null && v !== "" && v !== false);
          const missing = rows.filter(([, v]) => v == null || v === "" || v === false).map(([k]) => k);
          return (
            <>
              {filled.length > 0 && <dl className="space-y-2 text-sm">{filled.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>}
              {missing.length > 0 && <p className="text-xs text-slate-500">{filled.length === 0 ? "Chưa có thông tin." : `Chưa có: ${missing.join(", ")}.`}{isManager && <> <Link href="?tab=info" className="font-medium text-orange-700 hover:underline">Bổ sung</Link></>}</p>}
            </>
          );
        };
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stat(GraduationCap, `Điểm TB ${term?.termName ?? ""}`, s.gpa == null ? "-" : s.gpa.toFixed(2), s.gpa == null ? "Chưa có điểm" : rankOf(s.gpa, policy.gradeScale))}
              {stat(CalendarX, "Chuyên cần", `${absences.length} tiết vắng`, absences.length ? `Có phép ${excused} · không phép ${absences.length - excused}` : "Đi học đầy đủ", "bg-red-100 text-red-700")}
              {stat(ClipboardList, "Bài tập", exTotal ? `${exDone}/${exTotal} đã nộp` : "Chưa có bài tập", exTotal > exDone ? `Còn ${exTotal - exDone} bài chưa nộp` : undefined, "bg-sky-100 text-sky-700")}
              {stat(BookOpen, "Thư viện", `${borrowing} cuốn`, borrowing ? "Đang mượn" : "Không mượn sách", "bg-yellow-100 text-yellow-700")}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="space-y-3"><h2 className="font-semibold">Học tập</h2>
                {facts([["Năm học", s.current?.academicYear.yearName], ["Lớp", cls ? `${cls.className} (${cls.gradeLevel?.gradeName ?? ""})` : "Chưa xếp lớp"], ["Giáo viên chủ nhiệm", cls?.homeroomTeacher?.fullName], ["Mã học sinh", s.code]])}
              </Card>
              <Card className="space-y-3"><h2 className="font-semibold">Thông tin cá nhân</h2>
                {facts([["Giới tính", GENDER[s.gender ?? ""]], ["Ngày sinh", s.dob ? fmtDate(s.dob) : null], ["Nơi sinh", s.birthPlace], ["Dân tộc", s.ethnicity], ["Số CCCD", s.idNumber], ["Điện thoại", s.phone], ["Email liên hệ", s.contactEmail], ["Địa chỉ", s.address]])}
              </Card>
              <Card className="space-y-3"><h2 className="font-semibold">Phụ huynh</h2>
                {facts([["Họ tên", s.guardianName], ["Quan hệ", s.guardianRelation], ["Số điện thoại", s.guardianPhone], ["Email", s.guardianEmail], ["Nghề nghiệp", s.guardianJob]])}
              </Card>
            </div>
            {s.note && <Card className="space-y-1.5 text-sm"><h2 className="font-semibold">Ghi chú</h2><p className="whitespace-pre-line text-slate-600">{s.note}</p></Card>}
          </div>
        );
      })()}

      {tab === "info" && isManager && (
        <Card mobile="flat"><ActionForm action={updateStudent} submit="Lưu thông tin" reset={false} className="flex flex-col gap-4 [&>button]:self-start"><input type="hidden" name="id" value={s.id} /><StudentFields editing s={s} /></ActionForm></Card>
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
              {isManager && <DialogButton variant="secondary" label={s.current ? "Đổi lớp năm nay" : "Xếp lớp"} title="Xếp lớp cho học sinh"><ActionForm action={setStudentClass} submit="Xếp lớp" className="flex flex-col gap-3 [&>button]:self-start"><input type="hidden" name="studentId" value={s.id} /><Field label="Lớp"><SearchableSelect name="classId" required placeholder="-- chọn lớp --" className="w-full" options={classes.map((c) => ({ value: c.id, label: c.className }))} /></Field><Field label="Ngày hiệu lực"><input required type="date" name="effectiveDate" defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })} className={inputCls + " w-full"} /></Field><Field label="Lý do"><input required minLength={5} name="reason" className={inputCls + " w-full"} /></Field><Field label="Số quyết định / căn cứ"><input required minLength={3} name="decisionReference" className={inputCls + " w-full"} /></Field></ActionForm></DialogButton>}
            </Card>
            <Table head={["Thứ", "Tiết", "Môn", "Giáo viên", "Phòng"]}>
              {slots.map((x) => <tr key={x.id}><td>Thứ {x.dayOfWeek}</td><td>{x.periodNo}</td><td>{x.assignment.subject.subjectName}</td><td>{x.assignment.teacher.fullName}</td><td>{x.room.roomName}</td></tr>)}
              {!slots.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa có thời khóa biểu.</td></tr>}
            </Table>
          </div>
        );
      })()}

      {tab === "grades" && await (async () => {
        // Lọc theo NĂM HỌC trước, rồi HK1 / HK2 / Cả năm (quản lý và giáo viên luôn xem được, kể cả kỳ đang khóa với học sinh)
        const terms = await termOptions();
        const yr = resolvePeriod(terms, sp, currentTermId(terms));
        const ids = yr.period === "YEAR" ? yr.yearTerms.map((t) => t.id) : yr.term ? [yr.term.id] : [];
        const avgs = await db.subjectTermAverage.findMany({ where: { studentId: id, academicTermId: { in: ids.length ? ids : ["-"] } }, include: { assignment: { include: { subject: true } }, academicTerm: true } });
        const rows = buildYearRows(avgs.map((a) => ({ subjectId: a.assignment.subjectId, subjectName: a.assignment.subject.subjectName, termName: a.academicTerm.termName, value: a.averageValue })));
        const hiddenTerms = yr.yearTerms.filter((t) => t.gradesHidden && (yr.period === "YEAR" || t.id === yr.term?.id));
        return (
          <div className="space-y-3">
            <AutoForm className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="grades" />
              <SearchableSelect key={yr.yearId} name="yearId" defaultValue={yr.yearId} ariaLabel="Năm học" className="w-full md:w-48" options={yr.years.map((y) => ({ value: y.id, label: `Năm học ${y.yearName}` }))} />
              <SearchableSelect key={yr.period} name="period" defaultValue={yr.period} ariaLabel="Học kỳ" className="w-full md:w-60" options={PERIOD_OPTIONS} />
            </AutoForm>
            {hiddenTerms.length > 0 && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{hiddenTerms.map((t) => t.termName).join(", ")} đang khóa xem điểm với học sinh và phụ huynh (bạn vẫn xem được).</p>}
            {yr.period === "YEAR" ? (
              <Table head={["Môn học", "HK1", "HK2", "Cả năm", "Xếp loại"]}>
                {rows.map((r) => <tr key={r.subjectId}><td>{r.subjectName}</td><td>{r.hk1?.toFixed(1) ?? "-"}</td><td>{r.hk2?.toFixed(1) ?? "-"}</td><td className="font-bold">{r.year != null ? r.year.toFixed(1) : "-"}</td><td>{r.year != null ? rankOf(r.year, policy.gradeScale) : "-"}</td></tr>)}
                {rows.length > 0 && <tr className="bg-slate-50 font-semibold"><td>Trung bình các môn</td><td>{meanOf(rows.map((r) => r.hk1)) ?? "-"}</td><td>{meanOf(rows.map((r) => r.hk2)) ?? "-"}</td><td>{meanOf(rows.map((r) => r.year)) ?? "-"}</td><td>{rankOf(meanOf(rows.map((r) => r.year)), policy.gradeScale)}</td></tr>}
                {!rows.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa có điểm.</td></tr>}
              </Table>
            ) : (
              <Table head={["Môn học", `Điểm TB ${yr.period === "HK1" ? "HK1" : "HK2"}`, "Xếp loại"]}>
                {avgs.map((a) => <tr key={a.id}><td>{a.assignment.subject.subjectName}</td><td className="font-bold">{a.averageValue.toFixed(2)}</td><td>{rankOf(a.averageValue, policy.gradeScale)}</td></tr>)}
                {!avgs.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Chưa có điểm.</td></tr>}
              </Table>
            )}
          </div>
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
