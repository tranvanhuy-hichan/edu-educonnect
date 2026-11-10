import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { isAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/action-form";
import { PrintButton } from "@/components/print-button";
import { Card, Title } from "@/components/ui";
import { getExamEvent, EXAM_STATUS, EXAM_CATEGORY } from "@/modules/exams/queries";
import { examStaff } from "@/modules/exams/service";
import { examTime } from "@/modules/exams/planning";
import { changeExamStatus } from "../actions";

export default async function ExamDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES, "STUDENT");
  const { id } = await params;
  const event = await getExamEvent(user, id);
  if (!event) notFound();
  const manager = isAdmin(user), staff = examStaff(user);
  return <div className="space-y-4">
    <Title right={<div className="no-print flex gap-2"><PrintButton /><a href={`/lich-thi/${id}/xuat-excel`} className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm" title={staff ? "Tải Excel danh sách phòng thi" : "Tải lịch thi cá nhân"}><Download className="size-4" />{staff ? "Excel" : "Lịch cá nhân"}</a></div>}>{event.title}</Title>
    <Card className="space-y-2"><p className="font-medium">{event.gradeLevel.gradeName} · {EXAM_CATEGORY[event.category as keyof typeof EXAM_CATEGORY] ?? event.category} · {event.academicTerm.termName} · {event.academicTerm.academicYear.yearName}</p><p className="text-sm text-slate-500">Trạng thái: {EXAM_STATUS[event.status]}</p>{event.notes && <p className="whitespace-pre-line text-sm">{event.notes}</p>}</Card>
    {event.status === "CANCELLED" && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 font-semibold text-red-600">Lịch thi này đã bị hủy. Không tham dự theo lịch bên dưới.</p>}
    {manager && event.status !== "CANCELLED" && <Card mobile="flat" className="no-print flex flex-wrap gap-3">
      {event.status === "DRAFT" && <><Link href={`/lich-thi/${id}/sua`} className="rounded-md border px-3 py-2 text-sm">Sửa bản nháp</Link><ActionForm action={changeExamStatus} submit="Công bố lịch thi" confirmText="Công bố lịch này cho giáo viên và các học sinh có tên?" className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="operation" value="publish" /></ActionForm></>}
      {event.status === "PUBLISHED" && <ActionForm action={changeExamStatus} submit="Thu hồi để chỉnh sửa" confirmText="Thu hồi lịch khỏi danh sách của học sinh và giáo viên để chỉnh sửa?" className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="operation" value="withdraw" /></ActionForm>}
      <ActionForm action={changeExamStatus} submit="Hủy lịch thi" danger confirmText="Hủy toàn bộ lịch thi này và giải phóng phòng, giám thị? Dữ liệu lịch thi vẫn được giữ lại." className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="operation" value="cancel" /></ActionForm>
    </Card>}
    {event.papers.map((paper) => <section key={paper.id} className="space-y-3 break-inside-avoid">
      <h2 className="text-lg font-semibold">{paper.subject.subjectName}</h2>
      <Card className="grid gap-2 text-sm md:grid-cols-3"><p><b>Bắt đầu:</b> {examTime(paper.startsAt)}</p><p><b>Kết thúc:</b> {examTime(paper.endsAt)}</p><p><b>Có mặt:</b> {examTime(new Date(paper.startsAt.getTime() - paper.reportMinutes * 60000))}</p><p className="text-slate-500">{paper.grouping === "CLASS" ? "Thi theo lớp" : "Chia phòng theo alphabet"} · {Math.round((paper.endsAt.getTime() - paper.startsAt.getTime()) / 60000)} phút</p></Card>
      {paper.rooms.map((room) => <Card key={room.id} className="space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{room.label} · {room.room?.roomName ?? "Chưa gán phòng học"}</h3>{staff && <span className="text-sm text-slate-500">{room.seats.length} thí sinh{room.room ? ` / sức chứa ${room.room.capacity}` : ""}</span>}</div>
        <p className="text-sm">Giám thị: {room.invigilators.length ? room.invigilators.map((row) => `${row.position}. ${row.teacher.fullName}${row.teacherId === user.teacherId ? " (Bạn)" : ""}`).join(" · ") : "Chưa phân công"}</p>
        {staff ? <details><summary className="cursor-pointer text-sm text-orange-700">Danh sách thí sinh</summary><div className="mt-2 overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-2">Chỗ</th><th>SBD</th><th>Họ tên</th><th>Lớp</th><th>Mã HS</th><th className="hidden print:table-cell">Ký tên</th></tr></thead><tbody>{room.seats.map((seat) => <tr key={seat.id} className="border-b"><td className="p-2">{seat.seatNo}</td><td>{seat.registrationNo}</td><td>{seat.fullName}</td><td>{seat.className}</td><td>{seat.studentCode}</td><td className="hidden print:table-cell" /></tr>)}</tbody></table></div></details> : room.seats.map((seat) => <div key={seat.id} className="rounded-md bg-orange-50 p-4 text-orange-900"><p className="font-semibold">{seat.fullName} · {seat.className}</p><p className="mt-2">Số báo danh: <b className="text-lg">{seat.registrationNo}</b> · Chỗ ngồi: <b className="text-lg">{seat.seatNo}</b></p></div>)}
      </Card>)}
    </section>)}
  </div>;
}
