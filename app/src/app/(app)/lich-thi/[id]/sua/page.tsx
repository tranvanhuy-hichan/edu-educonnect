import { notFound } from "next/navigation";
import { requireRole, MANAGER_ROLES } from "@/lib/guard";
import { Card, Title } from "@/components/ui";
import { ExamBuilder } from "@/components/exam-builder";
import { examFormData, getExamEvent } from "@/modules/exams/queries";
import { localExamTime } from "@/modules/exams/planning";
import type { ExamPlan } from "@/modules/exams/schema";
export default async function EditExam({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(...MANAGER_ROLES);
  const { id } = await params;
  const event = await getExamEvent(user, id);
  if (!event) notFound();
  if (event.status !== "DRAFT") return <Card>Chỉ có thể sửa bản nháp. Thu hồi lịch đã công bố trước khi sửa.</Card>;
  const initial: ExamPlan = { title: event.title, category: event.category as ExamPlan["category"], termId: event.academicTermId, gradeId: event.gradeLevelId, notes: event.notes ?? "", papers: event.papers.map((paper) => ({ subjectId: paper.subjectId, grouping: paper.grouping, maxPerRoom: paper.maxPerRoom, roomCount: paper.roomCount, startsAt: localExamTime(paper.startsAt), durationMinutes: Math.round((paper.endsAt.getTime() - paper.startsAt.getTime()) / 60000), reportMinutes: paper.reportMinutes, excludedStudentIds: paper.excludedStudentIds, allocations: paper.rooms.map((room) => ({ key: room.groupKey, roomId: room.roomId, teacherIds: room.invigilators.map((row) => row.teacherId) })) })) };
  return <div className="space-y-4"><Title>Sửa lịch thi</Title><p className="text-sm text-slate-500">Khi chia phòng lại, danh sách thí sinh sẽ cập nhật theo dữ liệu học sinh hiện tại. Kiểm tra danh sách trước khi lưu.</p><ExamBuilder data={await examFormData()} initial={initial} eventId={id} /></div>;
}
