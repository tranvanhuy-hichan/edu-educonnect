import type { ExamPlan } from "./schema";
import type { ExamPreview } from "./service";
import { examDate, reservationConflict, type Reservation } from "./planning";
export type DraftReservation = Reservation & { key: string };
export function draftReservations(plan: ExamPlan, preview: ExamPreview): DraftReservation[] {
  return plan.papers.flatMap((paper) => {
    let startsAt: Date;
    try { startsAt = examDate(paper.startsAt); } catch { return []; }
    return (preview.papers.find((item) => item.subjectId === paper.subjectId)?.groups ?? []).map((group) => {
      const allocation = paper.allocations.find((item) => item.key === group.key);
      return { key: `${paper.subjectId}/${group.key}`, label: `${preview.papers.find((item) => item.subjectId === paper.subjectId)?.subjectName} · ${group.label}`, start: new Date(startsAt.getTime() - paper.reportMinutes * 60000), end: new Date(startsAt.getTime() + paper.durationMinutes * 60000), roomId: allocation?.roomId ?? null, teachers: allocation?.teacherIds ?? [], students: group.candidates.map((candidate) => candidate.id) };
    });
  });
}
export function draftExamIssues(plan: ExamPlan, preview: ExamPreview, rooms: { id: string; label: string; capacity: number }[]) {
  const issues: string[] = [];
  for (const paper of plan.papers) {
    const info = preview.papers.find((item) => item.subjectId === paper.subjectId);
    if (!info) continue;
    try { examDate(paper.startsAt); } catch { issues.push(`${info.subjectName}: chưa chọn ngày giờ thi hợp lệ`); }
    if (!Number.isInteger(paper.durationMinutes) || paper.durationMinutes < 5 || paper.durationMinutes > 360) issues.push(`${info.subjectName}: thời lượng cần từ 5 đến 360 phút`);
    if (!Number.isInteger(paper.reportMinutes) || paper.reportMinutes < 0 || paper.reportMinutes > 120) issues.push(`${info.subjectName}: giờ có mặt cần từ 0 đến 120 phút trước giờ thi`);
    for (const group of info.groups) {
      const allocation = paper.allocations.find((item) => item.key === group.key);
      const room = rooms.find((room) => room.id === allocation?.roomId);
      if (!room) issues.push(`${info.subjectName} · ${group.label}: chưa gán phòng`);
      else if (room.capacity < group.candidates.length) issues.push(`${info.subjectName} · ${group.label}: ${room.label} không đủ sức chứa`);
      if (!allocation?.teacherIds.length) issues.push(`${info.subjectName} · ${group.label}: chưa phân công giám thị`);
      if (allocation && new Set(allocation.teacherIds).size !== allocation.teacherIds.length) issues.push(`${info.subjectName} · ${group.label}: giám thị bị lặp`);
    }
  }
  const reservations = draftReservations(plan, preview);
  for (let i = 0; i < reservations.length; i++) for (let j = 0; j < i; j++) {
    const conflict = reservationConflict(reservations[i], reservations[j]);
    if (conflict) issues.push(`Trùng ${conflict}: ${reservations[i].label} và ${reservations[j].label}`);
  }
  return issues;
}
