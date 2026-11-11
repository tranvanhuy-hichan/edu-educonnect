"use server";
import { revalidatePath } from "next/cache";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str, int } from "@/lib/action";
import { parseDate } from "@/lib/format";
import { saveClassPeriodLog } from "@/modules/attendance/attendance.service";

/** Ghi (hoặc sửa) sổ đầu bài của một tiết trong một ngày. Quyền + quy tắc ngày nằm trong service. */
async function save(fd: FormData) {
  const me = await assertRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const date = str(fd, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ngày không hợp lệ");
  const rating = str(fd, "conductRating");
  // Danh sách vắng: mỗi học sinh một trường abs_<id> = "EXCUSED" | "UNEXCUSED" (rỗng = có mặt). Chỉ có khi form có danh sách lớp.
  const hasRoster = fd.get("roster") === "1";
  const absences = hasRoster ? [...fd.entries()].filter(([k, v]) => k.startsWith("abs_") && (v === "EXCUSED" || v === "UNEXCUSED")).map(([k, v]) => ({ studentId: k.slice(4), excused: v === "EXCUSED" })) : undefined;
  await saveClassPeriodLog(me, {
    timetableSlotId: str(fd, "slotId"),
    logDate: parseDate(date),
    attendanceAbsentCount: int(fd, "absent", 0),
    conductRating: rating || undefined,
    note: str(fd, "note") || undefined,
    lessonTitle: str(fd, "lessonTitle") || undefined,
    absences,
  });
  revalidatePath("/so-dau-bai");
  revalidatePath("/so-dau-bai/ghi");
  revalidatePath("/lich-hoc");
  return "Đã lưu sổ đầu bài";
}

export const saveLog = wrap(save);

/** Ghi sổ từ hộp "Ghi sổ" của lớp: ô chọn tiết có dạng "slotId|YYYY-MM-DD". */
export const saveLogPick = wrap(async (fd) => {
  const [slotId, date] = str(fd, "pick").split("|");
  if (!slotId || !date) throw new Error("Chọn tiết cần ghi sổ");
  fd.set("slotId", slotId);
  fd.set("date", date);
  return save(fd);
});
