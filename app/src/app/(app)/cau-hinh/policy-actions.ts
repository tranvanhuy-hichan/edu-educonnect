"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRole, ADMIN_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import { policySchema, type Policy } from "@/lib/policy-schema";
import { getPolicy } from "@/lib/policy";

/** Lưu quy chế học tập & danh mục. Không cho xóa mã danh mục đang được sử dụng. */
export const savePolicy = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  let raw: unknown;
  try { raw = JSON.parse(str(fd, "policy")); } catch { throw new Error("Dữ liệu cấu hình không hợp lệ"); }
  const parsed = policySchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Cấu hình không hợp lệ");
  const next = parsed.data as Policy;
  const prev = await getPolicy();

  const gone = (a: { code: string }[], b: { code: string }[]) => a.filter((x) => !b.some((y) => y.code === x.code)).map((x) => x.code);
  const goneRooms = gone(prev.roomTypes, next.roomTypes), goneExams = gone(prev.examCategories, next.examCategories);
  if (goneRooms.length && (await db.room.count({ where: { roomType: { in: goneRooms } } }))) throw new Error("Không xóa được loại phòng đang có phòng sử dụng");
  if (goneExams.length && (await db.examEvent.count({ where: { category: { in: goneExams } } }))) throw new Error("Không xóa được loại kỳ thi đang có lịch thi sử dụng");

  const goneRatings = prev.diaryRatings.filter((r) => !next.diaryRatings.some((n) => n.code === r.code)).map((r) => r.code);
  if (goneRatings.length && (await db.classPeriodLog.count({ where: { conductRating: { in: goneRatings } } }))) throw new Error("Không xóa được mức xếp loại tiết học đã có sổ đầu bài sử dụng");

  await db.schoolSetting.upsert({ where: { id: "school" }, update: { policy: next }, create: { id: "school", policy: next } });
  await audit(me.email, "update_policy", "SchoolSetting", "school");
  revalidatePath("/", "layout");
  return "Đã lưu quy chế. Áp dụng ngay cho các lần tính mới; hồ sơ đã duyệt giữ nguyên.";
});
