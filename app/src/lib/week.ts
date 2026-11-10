import { addDays, mondayOf } from "@/lib/format";

const WEEK_MS = 7 * 86400_000;

/** Tuần 1 = tuần (Thứ 2–CN) chứa ngày bắt đầu năm học (đặt ở Cấu hình → Năm học); các tuần sau đếm tiếp. */
export const weekStart = (yearStart: Date, n: number) => addDays(mondayOf(yearStart), (n - 1) * 7);
export const weekNumber = (yearStart: Date, d: Date) => Math.floor((mondayOf(d).getTime() - mondayOf(yearStart).getTime()) / WEEK_MS) + 1;
export const weekCount = (yearStart: Date, yearEnd: Date) => Math.max(1, weekNumber(yearStart, yearEnd));
export const clampWeek = (n: number, total: number) => Math.min(Math.max(n, 1), total);
/** "09/11" */
export const shortDate = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
