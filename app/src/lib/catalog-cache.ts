import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

/** Danh mục ít thay đổi (khối, môn học) đọc ở nhiều trang: lưu đệm dùng chung; thao tác sửa danh mục gọi `updateTag("catalog")`. */
export const getGradeLevels = unstable_cache(
  () => db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
  ["catalog-grade-levels"],
  { tags: ["catalog"], revalidate: 3600 },
);
export const getSubjects = unstable_cache(
  () => db.subject.findMany({ orderBy: { subjectName: "asc" } }),
  ["catalog-subjects"],
  { tags: ["catalog"], revalidate: 3600 },
);
