import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { withTransaction, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
import { examRepository } from "./exams.repository";
import { appendAudit } from "@/modules/academic/records.repository";
import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { compareCandidates, examDate, examTime, groupCandidates, reservationConflict, timeOverlap, type Candidate, type Reservation } from "./planning";
import type { ExamPlan } from "./schema";

type Client = DatabaseContext | undefined;
function manager(user: SessionUser) { if (!isAdmin(user)) throw new Error("Chỉ quản trị/ban giám hiệu được lập và sửa lịch thi"); }
export function examVisibility(user: SessionUser): Prisma.ExamEventWhereInput {
  if (isAdmin(user)) return {};
  if (user.roles.some((role) => role === "SUBJECT_TEACHER" || role === "HOMEROOM_TEACHER")) return { OR: [{ status: "PUBLISHED" }, { status: "CANCELLED", publishedAt: { not: null } }] };
  if (user.studentId && user.roles.includes("STUDENT")) return { OR: [{ status: "PUBLISHED" }, { status: "CANCELLED", publishedAt: { not: null } }], papers: { some: { seats: { some: { studentId: user.studentId } } } } };
  return { id: "__no_access__" };
}
export function examStaff(user: SessionUser) { return isAdmin(user) || user.roles.some((role) => role === "SUBJECT_TEACHER" || role === "HOMEROOM_TEACHER"); }

export async function prepareExamPlan(user: SessionUser, input: ExamPlan, client?: Client) {
  manager(user);
  const term = await examRepository(client).term(input.termId);
  const grade = await examRepository(client).grade(input.gradeId);
  const rosters = await Promise.all(input.papers.map(async (paper) => {
    const subject = await examRepository(client).subject(paper.subjectId);
    const enrollments = await examRepository(client).candidates(term.academicYearId, grade.id, paper.subjectId);
    if (enrollments.length > 10000) throw new Error("Mỗi môn hỗ trợ tối đa 10.000 thí sinh");
    const available = new Set(enrollments.map((enrollment) => enrollment.studentId));
    if (paper.excludedStudentIds.some((id) => !available.has(id))) throw new Error(`${subject.subjectName}: danh sách loại trừ không còn khớp học sinh hiện tại, hãy khôi phục danh sách và chia lại`);
    const candidates: Candidate[] = enrollments.filter((enrollment) => !paper.excludedStudentIds.includes(enrollment.studentId)).map((enrollment) => ({ id: enrollment.studentId, fullName: enrollment.student.fullName, code: enrollment.student.code ?? enrollment.studentId, classId: enrollment.schoolClassId, className: enrollment.schoolClass.className, classRoomId: enrollment.schoolClass.roomId }));
    if (!candidates.length) throw new Error(`${subject.subjectName}: không có học sinh đang hoạt động, đã xếp lớp và lớp đã chọn môn này trong khối/học kỳ đã chọn`);
    return { paper, subjectName: subject.subjectName, candidates };
  }));
  const union = [...new Map(rosters.flatMap((roster) => roster.candidates).map((candidate) => [candidate.id, candidate])).values()].sort(compareCandidates);
  const registrations = new Map(union.map((candidate, index) => [candidate.id, String(index + 1).padStart(4, "0")]));
  const papers = rosters.map(({ paper, subjectName, candidates }) => ({ subjectId: paper.subjectId, subjectName, grouping: paper.grouping, groups: groupCandidates(candidates, paper, registrations), candidateCount: candidates.length }));
  const fingerprint = createHash("sha256").update(JSON.stringify(papers)).digest("hex");
  return { papers, fingerprint, gradeName: grade.gradeName, termName: `${term.termName} · ${term.academicYear.yearName}` };
}
export type ExamPreview = Awaited<ReturnType<typeof prepareExamPlan>>;

async function validateReservations(client: Client, incoming: Reservation[], excludeEventId?: string) {
  if (!incoming.length) throw new Error("Chưa có phòng thi");
  for (let i = 0; i < incoming.length; i++) for (let j = 0; j < i; j++) {
    const conflict = reservationConflict(incoming[i], incoming[j]);
    if (conflict) throw new Error(`Trùng ${conflict}: ${incoming[i].label} và ${incoming[j].label}. Khoảng ${examTime(incoming[i].start)} – ${examTime(incoming[i].end)} đã bị chiếm (tính cả giờ có mặt).`);
  }
  const earliest = new Date(Math.min(...incoming.map((item) => item.start.getTime())));
  const latest = new Date(Math.max(...incoming.map((item) => item.end.getTime())) + 120 * 60000);
  const others = await examRepository(client).overlappingReservations(earliest, latest, excludeEventId);
  for (const item of incoming) for (const other of others) {
    const conflict = reservationConflict(item, { label: other.label, start: new Date(other.paper.startsAt.getTime() - other.paper.reportMinutes * 60000), end: other.paper.endsAt, roomId: other.roomId, teachers: other.invigilators.map((row) => row.teacherId), students: other.seats.map((row) => row.studentId) });
    if (conflict) throw new Error(`${item.label}: trùng ${conflict} với ${other.paper.event.title} · ${other.paper.subject.subjectName} · ${other.label} (bao gồm thời gian có mặt).`);
  }
}

export async function reviewExamPlan(user: SessionUser, input: ExamPlan, fingerprint: string, eventId?: string, client?: Client, complete = true) {
  manager(user);
  const preview = await prepareExamPlan(user, input, client);
    if (preview.fingerprint !== fingerprint) throw new Error("Danh sách thí sinh hoặc cách chia đã thay đổi. Hãy xem trước lại trước khi lưu.");
    const [rooms, teachers, term] = await Promise.all([
      examRepository(client).rooms(), examRepository(client).activeTeachers(), examRepository(client).term(input.termId),
    ]);
    const reservations: Reservation[] = [];
    const prepared = input.papers.map((paper) => {
      const grouping = preview.papers.find((item) => item.subjectId === paper.subjectId)!;
      const startsAt = examDate(paper.startsAt), endsAt = new Date(startsAt.getTime() + paper.durationMinutes * 60000);
      if (startsAt <= new Date()) throw new Error(`${grouping.subjectName}: giờ thi phải ở tương lai`);
      const schoolDay = new Date(`${paper.startsAt.slice(0, 10)}T00:00:00Z`);
      const endDay = new Date(new Date(endsAt.getTime() + 7 * 3600000).toISOString().slice(0, 10) + "T00:00:00Z");
      if (schoolDay < term.startDate || endDay > term.endDate) throw new Error(`${grouping.subjectName}: ngày thi phải nằm trong học kỳ`);
      if (new Set(paper.allocations.map((allocation) => allocation.key)).size !== paper.allocations.length || paper.allocations.some((allocation) => !grouping.groups.some((group) => group.key === allocation.key))) throw new Error("Danh sách phân phòng không khớp bản xem trước");
      const groups = grouping.groups.map((group) => {
        const allocation = paper.allocations.find((allocation) => allocation.key === group.key);
        const room = allocation?.roomId ? rooms.find((room) => room.id === allocation.roomId) : null;
        if (allocation?.roomId && !room) throw new Error(`${group.label}: phòng học không tồn tại`);
        if (room && group.candidates.length > room.capacity) throw new Error(`${grouping.subjectName} · ${group.label}: ${group.candidates.length} học sinh vượt sức chứa ${room.roomName} (${room.capacity})`);
        const teacherIds = allocation?.teacherIds ?? [];
        if (new Set(teacherIds).size !== teacherIds.length || teacherIds.some((id) => !teachers.some((teacher) => teacher.id === id))) throw new Error(`${group.label}: giám thị không hợp lệ hoặc bị lặp`);
        reservations.push({ label: `${grouping.subjectName} · ${group.label}`, start: new Date(startsAt.getTime() - paper.reportMinutes * 60000), end: endsAt, roomId: room?.id ?? null, teachers: teacherIds, students: group.candidates.map((candidate) => candidate.id) });
        return { group, roomId: room?.id ?? null, teacherIds };
      });
      return { paper, startsAt, endsAt, groups };
    });
    await validateReservations(client, reservations, eventId);
  if (complete) {
    for (const row of prepared) for (const allocation of row.groups) {
      if (!allocation.roomId) throw new Error(`${row.paper.subjectId === "" ? "Môn thi" : preview.papers.find((paper) => paper.subjectId === row.paper.subjectId)!.subjectName} · ${allocation.group.label}: chưa chọn phòng học`);
      if (!allocation.teacherIds.length) throw new Error(`${allocation.group.label}: cần ít nhất một giám thị`);
    }
  }
  return { preview, prepared };
}

/** A shared lock makes collision checks and writes atomic across all exam events. */
export async function saveExamPlan(user: SessionUser, input: ExamPlan, fingerprint: string, eventId?: string, transaction?: Client) {
  manager(user);
  const work = async (client: Client) => {
    await examRepository(client).lock();
    if (eventId) {
      const existing = await examRepository(client).event(eventId);
      if (existing.status !== "DRAFT") throw new Error("Chỉ sửa lịch nháp. Hãy thu hồi lịch đã công bố trước khi sửa.");
    }
    const { prepared } = await reviewExamPlan(user, input, fingerprint, eventId, client, false);
    const data = { title: input.title, category: input.category, academicTermId: input.termId, gradeLevelId: input.gradeId, notes: input.notes || null };
    const event = eventId ? await examRepository(client).updateEvent(eventId, { ...data, revision: { increment: 1 } }) : await examRepository(client).createEvent({ ...data, createdBy: user.email });
    if (eventId) await examRepository(client).clearPapers(eventId);
    for (const preparedPaper of prepared) {
      const { paper, startsAt, endsAt, groups } = preparedPaper;
      const created = await examRepository(client).createPaper({ eventId: event.id, subjectId: paper.subjectId, grouping: paper.grouping, roomCount: paper.roomCount, maxPerRoom: paper.maxPerRoom, startsAt, endsAt, reportMinutes: paper.reportMinutes, excludedStudentIds: paper.excludedStudentIds });
      for (const { group, roomId, teacherIds } of groups) {
        const room = await examRepository(client).createRoom({ paperId: created.id, groupKey: group.key, label: group.label, roomId, invigilators: { create: teacherIds.map((teacherId, index) => ({ teacherId, position: index + 1 })) } });
        await examRepository(client).createSeats(group.candidates.map((candidate) => ({ paperId: created.id, examRoomId: room.id, studentId: candidate.id, registrationNo: candidate.registrationNo, seatNo: candidate.seatNo, fullName: candidate.fullName, studentCode: candidate.code, className: candidate.className })));
      }
    }
    await appendAudit({ actorEmail: user.email, action: eventId ? "update_exam" : "create_exam", targetType: "ExamEvent", targetId: event.id }, client);
    return event;
  };
  return transaction ? work(transaction) : withTransaction(work, { timeout: 30000 });
}

export async function transitionExam(user: SessionUser, id: string, action: "publish" | "withdraw" | "cancel", transaction?: Client) {
  manager(user);
  const work = async (client: Client) => {
    await examRepository(client).lock();
    const event = await examRepository(client).event(id);
    if (event.status === "CANCELLED") throw new Error("Lịch đã hủy, không thể chuyển trạng thái");
    if (action === "publish") {
      if (event.status !== "DRAFT") throw new Error("Lịch này đã được công bố");
      const reservations: Reservation[] = [];
      if (!event.papers.length) throw new Error("Chưa có môn thi");
      for (const paper of event.papers) {
        if (paper.startsAt <= new Date()) throw new Error("Không thể công bố lịch thi đã đến giờ bắt đầu");
        if (!paper.rooms.length) throw new Error("Môn thi chưa có phòng thi");
        for (const room of paper.rooms) {
          if (!room.room || !room.seats.length || !room.invigilators.length) throw new Error(`${room.label}: cần gán phòng học, thí sinh và ít nhất một giám thị trước khi công bố`);
          if (room.seats.length > room.room.capacity) throw new Error(`${room.label}: vượt sức chứa phòng học`);
          if (room.invigilators.some((row) => !row.teacher.user.isActive)) throw new Error(`${room.label}: tài khoản giám thị đã bị khóa`);
          reservations.push({ label: room.label, start: new Date(paper.startsAt.getTime() - paper.reportMinutes * 60000), end: paper.endsAt, roomId: room.roomId, teachers: room.invigilators.map((row) => row.teacherId), students: room.seats.map((row) => row.studentId) });
        }
      }
      await validateReservations(client, reservations, id);
    } else if (action === "withdraw") {
      if (event.status !== "PUBLISHED") throw new Error("Chỉ thu hồi lịch đã công bố");
      if (event.papers.some((paper) => paper.startsAt <= new Date())) throw new Error("Kỳ thi đã bắt đầu, không thể thu hồi để thay đổi danh sách");
    }
    const status = action === "publish" ? "PUBLISHED" : action === "withdraw" ? "DRAFT" : "CANCELLED";
    const updated = await examRepository(client).updateEvent(id, { status, revision: { increment: 1 }, ...(action === "publish" ? { publishedAt: new Date() } : {}) });
    await appendAudit({ actorEmail: user.email, action: `${action}_exam`, targetType: "ExamEvent", targetId: id }, client);
    return updated;
  };
  return transaction ? work(transaction) : withTransaction(work, { timeout: 30000 });
}

/** A suggestion only: keep selected exam times, assign free rooms and balance invigilation counts. */
export async function suggestExamResources(user: SessionUser, input: ExamPlan, fingerprint: string, proctors = 1, eventId?: string, client?: Client) {
  manager(user);
  if (proctors !== 1 && proctors !== 2) throw new Error("Chọn 1 hoặc 2 giám thị/phòng");
  const preview = await prepareExamPlan(user, input, client);
  if (preview.fingerprint !== fingerprint) throw new Error("Danh sách đã thay đổi. Hãy chia phòng lại.");
  const [rooms, teachers, occupied] = await Promise.all([
    examRepository(client).rooms(),
    examRepository(client).activeTeachers(),
    examRepository(client).futureReservations(new Date(), eventId),
  ]);
  const busy: Reservation[] = occupied.map((room) => ({ label: room.label, start: new Date(room.paper.startsAt.getTime() - room.paper.reportMinutes * 60000), end: room.paper.endsAt, roomId: room.roomId, teachers: room.invigilators.map((row) => row.teacherId), students: room.seats.map((seat) => seat.studentId) }));
  const load = new Map<string, number>();
  busy.forEach((reservation) => reservation.teachers.forEach((id) => load.set(id, (load.get(id) ?? 0) + 1)));
  const plan = structuredClone(input);
  const ordered = [...plan.papers].sort((a, b) => examDate(a.startsAt).getTime() - examDate(b.startsAt).getTime());
  for (const paper of ordered) {
    paper.allocations = [];
    const start = new Date(examDate(paper.startsAt).getTime() - paper.reportMinutes * 60000);
    const end = new Date(examDate(paper.startsAt).getTime() + paper.durationMinutes * 60000);
    const groups = [...preview.papers.find((row) => row.subjectId === paper.subjectId)!.groups].sort((a, b) => b.candidates.length - a.candidates.length || a.key.localeCompare(b.key));
    for (const group of groups) {
      const overlapping = busy.filter((reservation) => timeOverlap({ start, end }, reservation));
      if (overlapping.some((reservation) => reservation.students.some((id) => group.candidates.some((candidate) => candidate.id === id)))) throw new Error(`${group.label}: học sinh đã có ca thi trùng giờ, hãy đổi giờ thi trước khi gợi ý`);
      const available = rooms.filter((room) => room.capacity >= group.candidates.length && !overlapping.some((reservation) => reservation.roomId === room.id));
      const room = available.find((room) => room.id === group.preferredRoomId) ?? available[0];
      if (!room) throw new Error(`${group.label}: chưa tìm được phòng đủ chỗ và trống trong ca này`);
      const freeTeachers = teachers.filter((teacher) => !overlapping.some((reservation) => reservation.teachers.includes(teacher.id))).sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.fullName.localeCompare(b.fullName, "vi") || a.id.localeCompare(b.id));
      if (freeTeachers.length < proctors) throw new Error(`${group.label}: chưa đủ ${proctors} giám thị trống trong ca này`);
      const teacherIds = freeTeachers.slice(0, proctors).map((teacher) => teacher.id);
      paper.allocations.push({ key: group.key, roomId: room.id, teacherIds });
      teacherIds.forEach((id) => load.set(id, (load.get(id) ?? 0) + 1));
      busy.push({ label: group.label, start, end, roomId: room.id, teachers: teacherIds, students: group.candidates.map((candidate) => candidate.id) });
    }
  }
  await reviewExamPlan(user, plan, fingerprint, eventId, client);
  return plan;
}
