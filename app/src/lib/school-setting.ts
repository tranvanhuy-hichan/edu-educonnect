import { cache } from "react";
import { db } from "@/lib/db";

/** Cấu hình trường (tên, logo) — 1 dòng duy nhất, luôn tồn tại (tạo sẵn ở migration). Cache theo request. */
export const getSchoolSetting = cache(async () => {
  try {
    const s = await db.schoolSetting.findUnique({ where: { id: "school" } });
    return s ?? { id: "school", schoolName: "EduConnect", logoUrl: null, logoPublicId: null };
  } catch {
    return { id: "school", schoolName: "EduConnect", logoUrl: null, logoPublicId: null };
  }
});
