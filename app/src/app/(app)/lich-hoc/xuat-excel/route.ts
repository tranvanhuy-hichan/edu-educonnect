import { loadScheduleSlots } from "@/modules/scheduling/schedule-slots";
import { effectiveSlots } from "@/modules/scheduling/effective";
import { fmtDate, mondayOf, parseDate, todayUTC } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getMe, MANAGER_ROLES } from "@/lib/guard";
import { timetableWorkbook, type ExcelSheet, type ExcelSlot } from "@/modules/scheduling/excel";

export const dynamic = "force-dynamic";

const toExcel = (s: { dayOfWeek: number; periodNo: number; schoolClass: { className: string }; room: { roomName: string }; assignment: { subject: { subjectName: string }; teacher: { fullName: string } } }): ExcelSlot => ({
  dayOfWeek: s.dayOfWeek, periodNo: s.periodNo, subject: s.assignment.subject.subjectName, className: s.schoolClass.className, teacher: s.assignment.teacher.fullName, room: s.room.roomName,
});

/**
 * Xuất thời khóa biểu .xlsx.
 * ?term=<id>&type=class|teacher|all-classes|all-teachers[&id=<id>]
 * Quản lý xuất được tất cả; giáo viên chỉ lịch của mình; học sinh chỉ lịch lớp mình.
 */
export async function GET(request: Request) {
  const me = await getMe();
  if (!me) return new Response("Chưa đăng nhập", { status: 401 });

  const url = new URL(request.url);
  const termId = url.searchParams.get("term") ?? "";
  const type = url.searchParams.get("type") ?? "class";
  const id = url.searchParams.get("id") ?? "";
  const manager = me.roles.some((r) => MANAGER_ROLES.includes(r));

  const term = await prisma.academicTerm.findUnique({ where: { id: termId }, include: { academicYear: true } });
  if (!term) return new Response("Không tìm thấy học kỳ", { status: 404 });
  const requestedWeek = url.searchParams.get("w");
  const date = requestedWeek ? parseDate(requestedWeek) : todayUTC();
  if (Number.isNaN(date.getTime())) return new Response("Tuần không hợp lệ", { status: 400 });
  const week = mondayOf(date);
  const heading = `${term.termName} · năm học ${term.academicYear.yearName} · tuần từ ${fmtDate(week)}`;

  const sheets: ExcelSheet[] = [];
  const where = { academicTermId: termId, ...effectiveSlots(week) };

  if (type === "all-classes" || type === "all-teachers") {
    if (!manager) return new Response("Không có quyền", { status: 403 });
    if (type === "all-classes") {
      const classes = await prisma.schoolClass.findMany({ where: { OR: [{ timetableSlots: { some: where } }, { timetableActivities: { some: { version: { academicTermId: termId, ...effectiveSlots(week).version as object } } } }] }, orderBy: { className: "asc" } });
      for (const c of classes) {
        const slots = await loadScheduleSlots({ ...where, schoolClassId: c.id });
        sheets.push({ name: c.className, title: `Thời khóa biểu lớp ${c.className} — ${heading}`, mode: "class", slots: slots.map(toExcel) });
      }
    } else {
      const teachers = await prisma.teacher.findMany({ where: { assignments: { some: { timetableSlots: { some: where } } } }, orderBy: { fullName: "asc" } });
      for (const t of teachers) {
        const slots = await loadScheduleSlots({ ...where, assignment: { teacherId: t.id } });
        sheets.push({ name: t.fullName, title: `Lịch dạy giáo viên ${t.fullName} — ${heading}`, mode: "teacher", slots: slots.map(toExcel) });
      }
    }
  } else if (type === "teacher") {
    if (!manager && me.teacherId !== id) return new Response("Không có quyền", { status: 403 });
    const t = await prisma.teacher.findUnique({ where: { id } });
    if (!t) return new Response("Không tìm thấy giáo viên", { status: 404 });
    const slots = await loadScheduleSlots({ ...where, assignment: { teacherId: id } });
    sheets.push({ name: t.fullName, title: `Lịch dạy giáo viên ${t.fullName} — ${heading}`, mode: "teacher", slots: slots.map(toExcel) });
  } else {
    if (!manager) {
      const own = me.studentId ? await prisma.studentClassEnrollment.findFirst({ where: { studentId: me.studentId, schoolClassId: id } }) : null;
      const homeroom = me.teacherId ? await prisma.schoolClass.findFirst({ where: { id, homeroomTeacherId: me.teacherId } }) : null;
      const teaches = me.teacherId ? await prisma.classSubjectAssignment.findFirst({ where: { schoolClassId: id, teacherId: me.teacherId } }) : null;
      if (!own && !homeroom && !teaches) return new Response("Không có quyền", { status: 403 });
    }
    const c = await prisma.schoolClass.findUnique({ where: { id } });
    if (!c) return new Response("Không tìm thấy lớp", { status: 404 });
    const slots = await loadScheduleSlots({ ...where, schoolClassId: id });
    sheets.push({ name: c.className, title: `Thời khóa biểu lớp ${c.className} — ${heading}`, mode: "class", slots: slots.map(toExcel) });
  }

  if (!sheets.length) return new Response("Chưa có thời khóa biểu để xuất", { status: 404 });
  const buffer = await timetableWorkbook(sheets);
  const filename = `thoi-khoa-bieu-${week.toISOString().slice(0, 10)}-${term.termName}-${term.academicYear.yearName}.xlsx`.replace(/\s+/g, "-");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
