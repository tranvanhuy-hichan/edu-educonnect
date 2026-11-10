import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { MANAGER_ROLES, type Me } from "@/lib/guard";
import { todayUTC } from "@/lib/format";

/** Quản lý vận hành (ADMIN / Hiệu trưởng / Hiệu phó): thấy toàn trường. */
export const isManager = (me: Me) => me.roles.some((r) => MANAGER_ROLES.includes(r));
/** Học sinh thuần: chỉ có hồ sơ học sinh, không phải giáo viên/quản lý. */
export const isStudentOnly = (me: Me) => !!me.studentId && !me.teacherId && !isManager(me);

/**
 * Phạm vi lớp-môn (ClassSubjectAssignment) mỗi người được thấy:
 * quản lý = tất cả, giáo viên = lớp-môn mình dạy, học sinh = môn của lớp mình đang học.
 */
export function assignmentWhere(me: Me): Prisma.ClassSubjectAssignmentWhereInput {
  if (isManager(me)) return {};
  if (me.teacherId) return { teacherId: me.teacherId };
  if (me.studentId) return { schoolClass: { enrollments: { some: { studentId: me.studentId } } } };
  return { id: "-" };
}

/** Danh sách học kỳ (mới nhất trước) kèm năm học, dùng cho ô chọn lọc. */
export async function termOptions() {
  const terms = await db.academicTerm.findMany({ orderBy: { startDate: "desc" }, include: { academicYear: { select: { yearName: true } } } });
  return terms.map((t) => ({ id: t.id, label: `${t.termName} · ${t.academicYear.yearName}`, startDate: t.startDate, endDate: t.endDate }));
}

/** Học kỳ đang diễn ra (hoặc mới nhất nếu không có học kỳ nào bao trùm hôm nay). */
export function currentTermId(terms: { id: string; startDate: Date; endDate: Date }[]) {
  const today = todayUTC();
  return (terms.find((t) => t.startDate <= today && today <= t.endDate) ?? terms[0])?.id ?? null;
}
