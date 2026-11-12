import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError, ConflictError } from "@/shared/errors";
import { notifyUsers } from "@/modules/notification/notification.service";
import { notifyGradesPublishedToGuardians } from "@/modules/notification/guardian-events";
import * as repository from "./grade-visibility.repository";

/**
 * Khóa / công bố điểm một học kỳ với học sinh và phụ huynh. Chỉ Admin và Hiệu trưởng.
 * Giáo viên vẫn nhập điểm bình thường; quản lý vẫn xem được.
 */
export async function setGradesVisibility(user: SessionUser, input: { termId: string; hide: boolean; note?: string }) {
  if (!user.roles.includes("ADMIN") && !user.roles.includes("PRINCIPAL")) throw new ForbiddenError("Chỉ Admin và Hiệu trưởng được khóa hoặc công bố điểm");
  const term = await repository.findTerm(input.termId);
  if (term.gradesHidden === input.hide) throw new ConflictError(input.hide ? "Học kỳ này đã đang khóa xem điểm" : "Điểm học kỳ này đã được công bố");
  await repository.setHidden(term.id, input.hide
    ? { gradesHidden: true, gradesHiddenAt: new Date(), gradesHiddenBy: user.email, gradesHiddenNote: input.note?.trim() || null }
    : { gradesHidden: false, gradesHiddenAt: null, gradesHiddenBy: null, gradesHiddenNote: null });

  // Công bố → báo cho học sinh của năm học đó; lỗi thông báo không làm hỏng thao tác
  if (!input.hide) {
    try {
      await notifyUsers(await repository.studentUserIdsOfYear(term.academicYearId), {
        title: `Đã công bố điểm ${term.termName}`,
        content: `Nhà trường đã công bố điểm ${term.termName} · ${term.academicYear.yearName}. Em có thể xem trong mục Bảng điểm.`,
        type: "GRADE", link: "/diem-cua-toi",
      });
    } catch { /* bỏ qua */ }
    await notifyGradesPublishedToGuardians({ academicYearId: term.academicYearId, termName: term.termName, yearName: term.academicYear.yearName });
  }
  return term;
}
