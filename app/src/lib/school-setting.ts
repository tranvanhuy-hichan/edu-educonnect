import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

const DEFAULT = { id: "school", schoolName: "EduConnect", logoUrl: null, logoPublicId: null };

/**
 * Cấu hình trường (tên, logo, quy chế) — 1 dòng duy nhất, đọc ở MỌI trang nên lưu đệm dùng chung giữa các yêu cầu (tối đa 5 phút).
 * Các thao tác lưu cấu hình gọi `updateTag("school-setting")` để áp dụng ngay.
 */
const readSetting = unstable_cache(
  async () => db.schoolSetting.findUnique({ where: { id: "school" } }),
  ["school-setting"],
  { tags: ["school-setting"], revalidate: 300 },
);

export const getSchoolSetting = cache(async () => {
  try {
    return (await readSetting()) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
});
