"use server";
import { revalidatePath } from "next/cache";
import { assertRole, ADMIN_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const PRESETS = {
  open: { years: true, classes: true, placement: true, profiles: true },
  balanced: { years: false, classes: false, placement: false, profiles: true },
  edu: { years: false, classes: false, placement: false, profiles: false },
} as const;

/** Quyền ghi dữ liệu dùng chung của Cổng Đoàn: chỉ admin EduConnect đặt được. */
export const saveDoanPolicy = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const preset = str(fd, "preset") as keyof typeof PRESETS;
  const next = preset in PRESETS ? PRESETS[preset] : {
    years: fd.get("years") === "on", classes: fd.get("classes") === "on", placement: fd.get("placement") === "on", profiles: fd.get("profiles") === "on",
  };
  await db.doanWritePolicy.upsert({ where: { id: 1 }, update: { ...next, updatedBy: me.email }, create: { id: 1, ...next, updatedBy: me.email } });
  await audit(me.email, "update_doan_policy", "DoanWritePolicy", "1");
  revalidatePath("/cau-hinh");
  return "Đã lưu quyền của Cổng Đoàn";
});
