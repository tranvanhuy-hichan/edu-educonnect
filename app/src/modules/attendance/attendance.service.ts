import { isVersionEffective } from "@/modules/scheduling/effective";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { isAdmin, type SessionUser } from "@/lib/auth/session";
import { todayUTC } from "@/lib/format";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import * as attendanceRepository from "@/modules/attendance/attendance.repository";
import type { CreateClassPeriodLogInput } from "@/modules/attendance/attendance.schema";

/**
 * GVBM ghi sổ đầu bài cho đúng tiết mình dạy (theo TimetableSlot -> assignment.teacherId).
 * Mỗi (tiết TKB, ngày) chỉ có 1 bản ghi sổ đầu bài (unique timetableSlotId+logDate).
 */
export async function createClassPeriodLog(
  user: SessionUser,
  input: CreateClassPeriodLogInput,
) {
  const slot = await attendanceRepository.findTimetableSlotWithAssignment(
    input.timetableSlotId,
  );
  if (!slot) {
    throw new ConflictError("Tiết học (thời khóa biểu) không tồn tại");
  }

  if (!isVersionEffective(slot.version, input.logDate)) throw new ConflictError("Thời khóa biểu này không có hiệu lực vào ngày đã chọn");
  const allowed = await canManageClassSubjectAssignment(
    user,
    slot.assignmentId,
  );
  if (!allowed) {
    throw new ForbiddenError("Không có quyền ghi sổ đầu bài cho tiết này");
  }

  const existing = await attendanceRepository.findLogByCreateInput(
    input.timetableSlotId,
    input.logDate,
  );
  if (existing) {
    throw new ConflictError("Tiết học này ngày hôm đó đã được ghi sổ đầu bài");
  }

  return attendanceRepository.createClassPeriodLog(slot.schoolClassId, input);
}

export function listClassPeriodLogs(schoolClassId: string) {
  return attendanceRepository.listLogsBySchoolClass(schoolClassId);
}

/** Giáo viên chỉ được ghi/sửa sổ đầu bài trong vòng bao nhiêu ngày kể từ ngày học (quản lý thì không giới hạn). */
export const TEACHER_EDIT_DAYS = 7;

/**
 * Ghi hoặc sửa sổ đầu bài của một tiết trong một ngày cụ thể.
 * Quy tắc: đúng thứ của tiết, nằm trong học kỳ, sĩ số vắng ≤ sĩ số lớp; giáo viên không ghi ngày tương lai
 * và chỉ sửa được trong TEACHER_EDIT_DAYS ngày.
 */
export async function saveClassPeriodLog(user: SessionUser, input: CreateClassPeriodLogInput) {
  const slot = await attendanceRepository.findTimetableSlotWithAssignment(input.timetableSlotId);
  if (!slot) throw new ConflictError("Tiết học (thời khóa biểu) không tồn tại");

  if (!isVersionEffective(slot.version, input.logDate)) throw new ConflictError("Thời khóa biểu này không có hiệu lực vào ngày đã chọn");
  const allowed = await canManageClassSubjectAssignment(user, slot.assignmentId);
  if (!allowed) throw new ForbiddenError("Không có quyền ghi sổ đầu bài cho tiết này");

  const d = input.logDate;
  const weekday = d.getUTCDay() === 0 ? 8 : d.getUTCDay() + 1; // Thứ 2 = 2 … Thứ 7 = 7
  if (weekday !== slot.dayOfWeek) throw new ConflictError(`Ngày đã chọn không trùng thứ của tiết này (Thứ ${slot.dayOfWeek})`);

  const term = await attendanceRepository.findTermOfSlot(slot.academicTermId);
  if (term && (d < term.startDate || d > term.endDate)) throw new ConflictError("Ngày đã chọn nằm ngoài học kỳ của tiết này");

  const size = await attendanceRepository.countEnrollmentsOfClass(slot.schoolClassId);
  if (input.attendanceAbsentCount > size) throw new ConflictError(`Số học sinh vắng không thể lớn hơn sĩ số lớp (${size})`);

  if (!isAdmin(user)) {
    const today = todayUTC();
    if (d.getTime() > today.getTime()) throw new ConflictError("Chưa đến ngày học, chưa thể ghi sổ đầu bài");
    if ((today.getTime() - d.getTime()) / 86400_000 > TEACHER_EDIT_DAYS) {
      throw new ConflictError(`Đã quá ${TEACHER_EDIT_DAYS} ngày, giáo viên không thể sửa — liên hệ quản lý`);
    }
  }
  return attendanceRepository.upsertClassPeriodLog(slot.schoolClassId, input);
}
