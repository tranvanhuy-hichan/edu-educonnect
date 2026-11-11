import { gradeBand } from "@/lib/policy-schema";
import { db } from "@/lib/db";
import { todayUTC } from "@/lib/format";

/** Thứ trong TKB: 2..7 = Thứ 2..Thứ 7 (Chủ nhật = 8, không có tiết). */
export const DAYS = [2, 3, 4, 5, 6, 7];
export const DAY_NAME: Record<number, string> = { 2: "Thứ 2", 3: "Thứ 3", 4: "Thứ 4", 5: "Thứ 5", 6: "Thứ 6", 7: "Thứ 7", 8: "Chủ nhật" };
export const dowOf = (d: Date) => (d.getUTCDay() === 0 ? 8 : d.getUTCDay() + 1);

/** Học kỳ đang diễn ra hôm nay; nếu không có thì lấy học kỳ gần nhất. */
export async function currentTerm() {
  const today = todayUTC();
  return (
    (await db.academicTerm.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } }, include: { academicYear: true } })) ??
    (await db.academicTerm.findFirst({ orderBy: { startDate: "desc" }, include: { academicYear: true } }))
  );
}

export const ROLE_TAG: Record<string, string> = { HOMEROOM_TEACHER: "GVCN", SUBJECT_TEACHER: "GVBM", PRINCIPAL: "Hiệu trưởng", VICE_PRINCIPAL: "Hiệu phó", ADMIN: "Quản trị", LIBRARIAN: "Thủ thư", STUDENT: "Học sinh" };

/** Năm học đang diễn ra hôm nay; nếu không có thì lấy năm học gần nhất. */
export async function currentYear() {
  const today = todayUTC();
  return (await db.academicYear.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } } })) ?? (await db.academicYear.findFirst({ orderBy: { startDate: "desc" } }));
}

/** Xếp loại theo điểm TB, theo thang trong Cấu hình → Quy chế (truyền policy.gradeScale). */
export const rankOf = gradeBand;
export const initialOf = (name: string) => name.split(" ").pop()?.[0] ?? "?";
export const hueOfStr = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
