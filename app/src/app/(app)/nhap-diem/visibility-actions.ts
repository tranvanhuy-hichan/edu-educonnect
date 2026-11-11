"use server";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import { setGradesVisibility as setVisibility } from "@/modules/scoring/grade-visibility.service";

/** Khóa / công bố điểm một học kỳ với học sinh và phụ huynh (Admin, Hiệu trưởng). */
export const setGradesVisibility = wrap(async (fd) => {
  const me = await assertRole("ADMIN", "PRINCIPAL");
  const hide = str(fd, "hide") === "true";
  const term = await setVisibility(me, { termId: str(fd, "termId"), hide, note: str(fd, "note") });
  await audit(me.email, hide ? "hide_grades" : "publish_grades", "AcademicTerm", term.id);
  for (const path of ["/diem-cua-toi", "/phu-huynh", "/nhap-diem"]) revalidatePath(path);
  revalidatePath("/", "layout");
  return hide ? "Đã khóa xem điểm: học sinh và phụ huynh không xem được điểm học kỳ này" : "Đã công bố điểm cho học sinh và phụ huynh";
});
