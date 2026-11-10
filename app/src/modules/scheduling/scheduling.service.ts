import { scheduleWithOptions, type ScheduleOptions } from "./options";
import type { Prisma } from "@prisma/client";
import { insertVersion, lockTimetableTerm } from "./versions";
import { prisma } from "@/lib/prisma";
import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { ConflictError, ForbiddenError } from "@/modules/academic/academic.service";
import * as schedulingRepository from "@/modules/scheduling/scheduling.repository";
import type { CreateTimetableSlotInput } from "@/modules/scheduling/scheduling.schema";

async function validatePlacement(tx: Prisma.TransactionClient, input: CreateTimetableSlotInput, excludeId?: string) {
  const version = await tx.timetableVersion.findUnique({ where: { id: input.versionId } });
  const assignment = await tx.classSubjectAssignment.findUnique({ where: { id: input.assignmentId } });
  if (!version || version.academicTermId !== input.academicTermId || !assignment || assignment.academicTermId !== input.academicTermId || assignment.schoolClassId !== input.schoolClassId) {
    throw new ConflictError("Phân công hoặc phiên bản không thuộc học kỳ/lớp đã chọn");
  }
  const schoolClass = await tx.schoolClass.findUniqueOrThrow({ where: { id: input.schoolClassId } });
  if (!schoolClass.roomId || schoolClass.roomId !== input.roomId) throw new ConflictError("Mọi tiết học phải dùng đúng phòng cố định đã phân công cho lớp");
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 2 || input.dayOfWeek > 7 || !Number.isInteger(input.periodNo) || input.periodNo < 1 || input.periodNo > 10) throw new ConflictError("Thứ hoặc tiết không hợp lệ");
  if (schoolClass.shift === "MORNING" && input.periodNo > 5) {
    throw new ConflictError(`Lớp ${schoolClass.className} học ca sáng (tiết 1–5), không thể xếp vào ca chiều (tiết ${input.periodNo})`);
  }
  if (schoolClass.shift === "AFTERNOON" && input.periodNo <= 5) {
    throw new ConflictError(`Lớp ${schoolClass.className} học ca chiều (tiết 6–10), không thể xếp vào ca sáng (tiết ${input.periodNo})`);
  }
  const clashes = await tx.timetableSlot.findMany({ where: {
    versionId: input.versionId, dayOfWeek: input.dayOfWeek, periodNo: input.periodNo,
    ...(excludeId ? { id: { not: excludeId } } : {}),
    OR: [{ roomId: input.roomId }, { schoolClassId: input.schoolClassId }, { assignment: { teacherId: assignment.teacherId } }],
  }, include: { assignment: true } });
  if (clashes.some((s) => s.roomId === input.roomId)) throw new ConflictError("Phòng học này đã có lớp khác dùng vào giờ này");
  if (clashes.some((s) => s.schoolClassId === input.schoolClassId)) throw new ConflictError("Lớp này đã có tiết học khác vào giờ này");
  if (clashes.length) throw new ConflictError("Giáo viên này đã dạy lớp khác vào cùng khung giờ này");
}

/** All placement checks and writes are serialized within the term. */
export async function createTimetableSlot(user: SessionUser, input: CreateTimetableSlotInput) {
  if (!isAdmin(user)) throw new ForbiddenError("Không có quyền xếp thời khóa biểu");
  return prisma.$transaction(async (tx) => {
    await lockTimetableTerm(tx, input.academicTermId);
    await validatePlacement(tx, input);
    return tx.timetableSlot.create({ data: input });
  });
}

export function listTimetableByClass(
  schoolClassId: string,
  academicTermId: string,
) {
  return schedulingRepository.listSlotsBySchoolClass(schoolClassId, academicTermId);
}

export function listTimetableByTeacher(
  user: SessionUser,
  academicTermId: string,
) {
  if (!user.teacherId) {
    throw new ForbiddenError("Chỉ giáo viên mới có thời khóa biểu cá nhân");
  }
  return schedulingRepository.listSlotsByTeacher(user.teacherId, academicTermId);
}

export async function deleteTimetableSlot(user: SessionUser, id: string) {
  if (!isAdmin(user)) {
    throw new ForbiddenError("Chỉ Hiệu trưởng/Hiệu phó được xóa tiết trong TKB");
  }
  const slot = await schedulingRepository.findTimetableSlot(id);
  if (!slot) {
    throw new ConflictError("Tiết học không tồn tại");
  }
  if ((await schedulingRepository.countLogsOfSlot(id)) > 0) {
    throw new ConflictError("Tiết này đã có sổ đầu bài, không thể xoá khỏi thời khóa biểu");
  }
  return schedulingRepository.deleteTimetableSlot(id);
}

/** Changing a logged slot would rewrite diary history; create a new version instead. */
export async function updateTimetableSlot(user: SessionUser, id: string, input: { dayOfWeek: number; periodNo: number; roomId: string }) {
  if (!isAdmin(user)) throw new ForbiddenError("Không có quyền sửa thời khóa biểu");
  const original = await prisma.timetableSlot.findUniqueOrThrow({ where: { id } });
  return prisma.$transaction(async (tx) => {
    await lockTimetableTerm(tx, original.academicTermId);
    const slot = await tx.timetableSlot.findUniqueOrThrow({ where: { id } });
    if (await tx.classPeriodLog.count({ where: { timetableSlotId: id } })) throw new ConflictError("Tiết đã có sổ đầu bài. Hãy tạo phiên bản mới để đổi lịch.");
    await validatePlacement(tx, { ...slot, ...input }, id);
    return tx.timetableSlot.update({ where: { id }, data: input });
  });
}

/** Dữ liệu đầu vào cho thuật toán xếp tự động của một học kỳ (phân công + phòng + tiết đã có). */
export async function loadAutoScheduleInput(academicTermId: string, client: Prisma.TransactionClient = prisma) {
  const [assignments, rooms, term] = await Promise.all([
    client.classSubjectAssignment.findMany({
      where: { academicTermId },
      include: { subject: true, schoolClass: true, teacher: true },
      orderBy: [{ schoolClass: { className: "asc" } }, { subject: { subjectName: "asc" } }],
    }),
    client.room.findMany({ orderBy: { roomName: "asc" } }),
    client.academicTerm.findUniqueOrThrow({ where: { id: academicTermId }, include: { academicYear: true } }),
  ]);
  const classes = await client.schoolClass.findMany({ where: { academicYearId: term.academicYearId }, include: { gradeLevel: true, subjects: { include: { subject: true } } }, orderBy: { className: "asc" } });
  const grades = await client.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } });
  const missingAssignments = classes.flatMap((cls) => cls.subjects.filter((row) => !assignments.some((assignment) => assignment.schoolClassId === cls.id && assignment.subjectId === row.subjectId)).map((row) => ({ className: cls.className, subjectName: row.subject.subjectName })));
  return { assignments, rooms, classes, grades, missingAssignments };
}

/**
 * Tính (chưa lưu) thời khóa biểu tự động của một học kỳ — dùng chung cho xem trước và lưu để hai bước luôn khớp nhau.
 * replace=true: bỏ qua tiết hiện có (sẽ xếp lại từ đầu); replace=false: giữ tiết hiện có, chỉ xếp phần còn thiếu.
 */
export async function computeAutoSchedule(academicTermId: string, options: ScheduleOptions, client: Prisma.TransactionClient = prisma) {
  const { assignments, rooms, classes, grades, missingAssignments } = await loadAutoScheduleInput(academicTermId, client);
  if (missingAssignments.length) throw new ConflictError(`Cần phân công giáo viên trước khi xếp TKB: ${missingAssignments.map((row) => `${row.className} · ${row.subjectName}`).join(", ")}. Vào Phân công giảng dạy để bổ sung.`);
  const empty = classes.filter((cls) => !cls.subjects.length);
  if (empty.length) throw new ConflictError(`Chưa chọn môn học cho lớp: ${empty.map((cls) => cls.className).join(", ")}`);
  const computed = scheduleWithOptions({ classes, rooms, grades, assignments: assignments.map((a) => ({ id: a.id, schoolClassId: a.schoolClassId, teacherId: a.teacherId, subjectId: a.subjectId, roomId: a.schoolClass.roomId, periodsPerWeek: a.subject.defaultPeriodsPerWeek })) }, options);
  return { assignments, rooms, classes, ...computed, options };
}

/**
 * Generate a fresh version without deleting previous slots or their diary entries.
 */
export async function applyAutoSchedule(user: SessionUser, academicTermId: string, startsOn: Date, options: ScheduleOptions) {
  if (!isAdmin(user)) throw new ForbiddenError("Không có quyền tạo thời khóa biểu");
  return prisma.$transaction(async (tx) => {
    await lockTimetableTerm(tx, academicTermId);
    const preview = await computeAutoSchedule(academicTermId, options, tx);
    if (!preview.assignments.length) throw new ConflictError("Học kỳ này chưa có phân công giảng dạy nào");
    const missingRooms = preview.assignments.filter((assignment) => !assignment.schoolClass.roomId);
    if (missingRooms.length) throw new ConflictError(`Chưa phân công phòng cố định cho lớp: ${[...new Set(missingRooms.map((assignment) => assignment.schoolClass.className))].join(", ")}. Hãy sửa thông tin lớp trước.`);
    if (!preview.rooms.length) throw new ConflictError("Chưa có phòng học nào để xếp lịch");
    if (!preview.result.placements.length) throw new ConflictError("Không xếp được tiết nào, hãy kiểm tra phòng học và phân công");
    if (preview.result.unplaced.length) throw new ConflictError("Chưa xếp đủ tiết. Hãy kiểm tra phòng học, tải giáo viên và số tiết/tuần của mỗi lớp trước khi tạo.");
    const { version } = await insertVersion(tx, academicTermId, startsOn);
    await tx.timetableVersion.update({ where: { id: version.id }, data: { settings: options } });
    await tx.timetableActivity.createMany({ data: preview.activities.map((activity) => ({ ...activity, versionId: version.id })) });
    await tx.timetableSlot.createMany({
      data: preview.result.placements.map((p) => ({ versionId: version.id, schoolClassId: p.schoolClassId, assignmentId: p.assignmentId, roomId: p.roomId, academicTermId, dayOfWeek: p.dayOfWeek, periodNo: p.periodNo })),
    });
    return { created: preview.result.placements.length, unplaced: preview.result.unplaced, version };
  }, { timeout: 30000 });
}
