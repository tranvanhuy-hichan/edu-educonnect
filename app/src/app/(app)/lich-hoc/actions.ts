"use server";
import { parseScheduleOptions } from "@/modules/scheduling/options";
import { computeAutoSchedule } from "@/modules/scheduling/scheduling.service";
import { redirect } from "next/navigation";
import { parseStartingWeek } from "@/modules/scheduling/versions";
import { isoDate } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { assertRole, MANAGER_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import { applyAutoSchedule } from "@/modules/scheduling/scheduling.service";

/** Lưu thời khóa biểu tự động (tính lại ở server từ phân công hiện có của học kỳ). */
export const saveAutoSchedule = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const termId = str(fd, "termId");
  if (!termId) throw new Error("Chọn học kỳ");
  const startsOn = parseStartingWeek(str(fd, "startsOn"));
  const result = await applyAutoSchedule(me, termId, startsOn, parseScheduleOptions(str(fd, "options")));
  await audit(me.email, "auto_schedule", "AcademicTerm", termId);
  revalidatePath("/lich-hoc");
  revalidatePath("/lich-hoc/tu-dong");
  revalidatePath("/", "layout");
  redirect(`/lich-hoc?term=${encodeURIComponent(termId)}&w=${isoDate(startsOn)}&created=1&missing=${result.unplaced.reduce((sum, item) => sum + item.missing, 0)}`);
});


export const previewSchedule = wrap(async (fd) => {
  await assertRole(...MANAGER_ROLES);
  const options = parseScheduleOptions(str(fd, "options"));
  const preview = await computeAutoSchedule(str(fd, "termId"), options);
  return { ok: "Đã xếp lịch xem trước", data: { preview: JSON.stringify(preview) } };
});
