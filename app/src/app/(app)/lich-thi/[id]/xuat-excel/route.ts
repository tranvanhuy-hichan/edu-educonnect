import ExcelJS from "exceljs";
import { getMe } from "@/lib/guard";
import { getExamEvent } from "@/modules/exams/queries";
import { examStaff } from "@/modules/exams/service";
import { examTime } from "@/modules/exams/planning";

export const dynamic = "force-dynamic";
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r/g, "").replace(/\n/g, "\\n").replace(/[;,]/g, "\\$&");
function fold(line: string) {
  const encoder = new TextEncoder();
  const lines: string[] = []; let buffer = "";
  for (const character of line) { if (encoder.encode(buffer + character).length > 73) { lines.push(buffer); buffer = " " + character; } else buffer += character; }
  lines.push(buffer); return lines.join("\r\n");
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMe();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const event = await getExamEvent(user, (await params).id);
  if (!event) return new Response("Không tìm thấy lịch thi", { status: 404 });
  if (!examStaff(user)) {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EduConnect//Lich thi//VI", "CALSCALE:GREGORIAN", event.status === "CANCELLED" ? "METHOD:CANCEL" : "METHOD:PUBLISH"];
    for (const paper of event.papers) for (const room of paper.rooms) for (const seat of room.seats) {
      lines.push("BEGIN:VEVENT", `UID:${event.id}-${paper.subjectId}-${seat.studentId}@educonnect`, `SEQUENCE:${event.revision}`, `STATUS:${event.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`, `LAST-MODIFIED:${stamp(event.updatedAt)}`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(paper.startsAt)}`, `DTEND:${stamp(paper.endsAt)}`, `SUMMARY:${escape(`${event.title} · ${paper.subject.subjectName}`)}`, `LOCATION:${escape(room.room?.roomName ?? room.label)}`, `DESCRIPTION:${escape(`SBD ${seat.registrationNo} · Chỗ ${seat.seatNo}\nCó mặt: ${examTime(new Date(paper.startsAt.getTime() - paper.reportMinutes * 60000))}\n${event.notes ?? ""}`)}`, "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return new Response(lines.map(fold).join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar;charset=utf-8", "Content-Disposition": 'attachment; filename="lich-thi-ca-nhan.ics"', "Cache-Control": "private, no-store" } });
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EduConnect";
  const summary = workbook.addWorksheet("Lich thi");
  summary.addRow([event.title, event.status]);
  summary.addRow([event.gradeLevel.gradeName, `${event.academicTerm.termName} · ${event.academicTerm.academicYear.yearName}`]);
  summary.addRow(["Môn", "Nhóm thi", "Phòng học", "Số HS", "Có mặt", "Bắt đầu", "Kết thúc", "Giám thị"]);
  summary.columns = [{ width: 24 }, { width: 22 }, { width: 18 }, { width: 10 }, { width: 23 }, { width: 23 }, { width: 23 }, { width: 50 }];
  let number = 0;
  for (const paper of event.papers) for (const room of paper.rooms) {
    const invigilators = room.invigilators.map((row) => `${row.position}. ${row.teacher.fullName}`).join(" · ");
    summary.addRow([paper.subject.subjectName, room.label, room.room?.roomName ?? "Chưa gán", room.seats.length, examTime(new Date(paper.startsAt.getTime() - paper.reportMinutes * 60000)), examTime(paper.startsAt), examTime(paper.endsAt), invigilators]);
    const name = `${++number}-${paper.subject.subjectName}-${room.label}`.replace(/[\\/*?:\[\]]/g, "-").slice(0, 31);
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([event.title]); sheet.mergeCells("A1:G1");
    sheet.addRow([`${paper.subject.subjectName} · ${room.label} · ${room.room?.roomName ?? "Chưa gán phòng"}`]); sheet.mergeCells("A2:G2");
    sheet.addRow([`${examTime(paper.startsAt)} – ${examTime(paper.endsAt)}`]); sheet.mergeCells("A3:G3");
    sheet.addRow([`Giám thị: ${invigilators || "Chưa phân công"}`]); sheet.mergeCells("A4:G4");
    sheet.addRow(["Chỗ", "Số báo danh", "Họ tên", "Lớp", "Mã học sinh", "Ký tên", "Ghi chú"]);
    for (const seat of room.seats) sheet.addRow([seat.seatNo, seat.registrationNo, seat.fullName, seat.className, seat.studentCode, "", ""]);
    sheet.columns = [{ width: 8 }, { width: 15 }, { width: 32 }, { width: 12 }, { width: 18 }, { width: 24 }, { width: 25 }];
    sheet.getRow(5).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 5 }];
    sheet.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:5" };
    sheet.eachRow((row) => { row.height = 24; row.alignment = { vertical: "middle", wrapText: true }; });
  }
  summary.getRow(3).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="lich-thi-va-danh-sach-phong.xlsx"', "Cache-Control": "private, no-store" } });
}
