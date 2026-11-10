import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { prepareExamPlan, reviewExamPlan, saveExamPlan, suggestExamResources } from "../src/modules/exams/service";
import { examTime } from "../src/modules/exams/planning";
import { getExamEvent } from "../src/modules/exams/queries";
import type { ExamPlan } from "../src/modules/exams/schema";

async function main() {
  const title = "Lịch thi mẫu hoàn chỉnh · Khối 11 · HK1 2026–2027";
  const [admin, grade, term, subjects, previous] = await Promise.all([
    prisma.user.findFirst({ where: { isActive: true, roles: { has: "ADMIN" } }, include: { teacher: true, student: true } }),
    prisma.gradeLevel.findUnique({ where: { gradeName: "Khối 11" } }),
    prisma.academicTerm.findFirst({ where: { termName: "HK1", academicYear: { yearName: "2026-2027" } } }),
    prisma.subject.findMany({ where: { subjectName: { in: ["Toán", "Vật lý"] } } }),
    prisma.examEvent.findFirst({ where: { title, notes: { contains: "MẪU DEMO" } } }),
  ]);
  assert.ok(admin && grade && term && subjects.length === 2, "Thiếu dữ liệu nền để tạo ví dụ");
  assert.ok(!previous || previous.status === "DRAFT", "Ví dụ trước đã được công bố/hủy; không ghi đè");
  const user = { userId: admin.id, email: admin.email, roles: admin.roles, teacherId: admin.teacher?.id ?? null, studentId: admin.student?.id ?? null };
  const plan: ExamPlan = { title, category: "GIUA_KY", termId: term.id, gradeId: grade.id, notes: "MẪU DEMO để xem và duyệt giao diện. Dùng danh sách học sinh/giáo viên hiện có. Chưa công bố cho học sinh. Toán chia alphabet, Vật lý thi theo lớp; 1 giám thị/phòng. Nhà trường điều chỉnh trước khi sử dụng chính thức.", papers: [
    { subjectId: subjects.find((subject) => subject.subjectName === "Toán")!.id, grouping: "ALPHABET", maxPerRoom: 14, roomCount: null, startsAt: "2026-11-16T08:00", durationMinutes: 90, reportMinutes: 15, excludedStudentIds: [], allocations: [] },
    { subjectId: subjects.find((subject) => subject.subjectName === "Vật lý")!.id, grouping: "CLASS", maxPerRoom: null, roomCount: null, startsAt: "2026-11-16T10:00", durationMinutes: 45, reportMinutes: 15, excludedStudentIds: [], allocations: [] },
  ] };
  const preview = await prepareExamPlan(user, plan);
  const allocated = await suggestExamResources(user, plan, preview.fingerprint, 1, previous?.id);
  await reviewExamPlan(user, allocated, preview.fingerprint, previous?.id);
  const created = await saveExamPlan(user, allocated, preview.fingerprint, previous?.id);
  await reviewExamPlan(user, allocated, preview.fingerprint, created.id);
  const event = await getExamEvent(user, created.id);
  assert.ok(event && event.status === "DRAFT");
  assert.ok(event.papers.every((paper) => paper.rooms.every((room) => room.room && room.invigilators.length > 0 && room.seats.length > 0)));
  const result = { id: event.id, path: `/lich-thi/${event.id}`, title: event.title, status: event.status, papers: event.papers.map((paper) => ({ subject: paper.subject.subjectName, startsAt: examTime(paper.startsAt), endsAt: examTime(paper.endsAt), candidates: paper.rooms.reduce((sum, room) => sum + room.seats.length, 0), rooms: paper.rooms.map((room) => ({ label: room.label, room: room.room!.roomName, candidates: room.seats.length, proctors: room.invigilators.map((row) => row.teacher.fullName) })) })) };
  await writeFile("/tmp/educonnect-demo-exam.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().finally(() => prisma.$disconnect());
