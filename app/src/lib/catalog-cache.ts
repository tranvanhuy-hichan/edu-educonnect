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

/**
 * Số lượng năm học / khối / học kỳ hiện ở nhãn tab Cấu hình. Đệm ngắn (60 giây) vì CSDL dùng chung với Cổng Đoàn
 * nên có thể đổi từ bên ngoài; thao tác sửa trong trang gọi `updateTag("config-counts")` để cập nhật ngay.
 */
export const getConfigCounts = unstable_cache(
  async () => {
    const [years, grades, terms] = await Promise.all([db.academicYear.count(), db.gradeLevel.count(), db.academicTerm.count()]);
    return { years, grades, terms };
  },
  ["config-counts"],
  { tags: ["config-counts"], revalidate: 60 },
);
