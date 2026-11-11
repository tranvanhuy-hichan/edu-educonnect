/**
 * Quy chế học tập & danh mục do admin cấu hình (Cấu hình → Quy chế). Thuần dữ liệu, không phụ thuộc DB nên dùng được ở cả server, client và test.
 * DEFAULT_POLICY giữ đúng các giá trị từng được viết cứng trong code, nên chưa cấu hình gì thì hệ thống chạy như cũ.
 */
import { z } from "zod";

export type GradeBand = { name: string; min: number };
/** Một mức xếp loại học lực cả năm. Mức CUỐI CÙNG là mức "không đạt" mặc định (không cần điều kiện). */
export type LearningLevel = { name: string; minEach: number; highScore: number; highCount: number; maxFailedComments: number };
export type CatalogItem = { code: string; label: string };
/** Mức xếp loại tiết học trong sổ đầu bài: mã lưu trong dữ liệu (không đổi), ký hiệu hiển thị (A, B, C…) và chữ đi kèm. */
export type DiaryRating = { code: string; symbol: string; label: string };

export type Policy = {
  /** Thang xếp loại theo điểm TB (điểm tối thiểu giảm dần): dùng ở bảng điểm, hồ sơ học sinh, lớp học. */
  gradeScale: GradeBand[];
  learning: {
    /** Mức xếp loại học lực cả năm, từ tốt nhất đến kém nhất. */
    levels: LearningLevel[];
    /** Mức xếp loại rèn luyện, từ tốt nhất đến kém nhất (mức cuối = không đạt → cần đánh giá lại). */
    conductLevels: string[];
  };
  promotion: { maxAbsenceDays: number; classCapacity: number; attentionBelow: number };
  roomTypes: CatalogItem[];
  examCategories: CatalogItem[];
  /** Xếp loại tiết học (sổ đầu bài), từ tốt nhất đến kém nhất. */
  diaryRatings: DiaryRating[];
  library: { maxBooksPerStudent: number };
};

export const DEFAULT_POLICY: Policy = {
  gradeScale: [{ name: "Xuất sắc", min: 9 }, { name: "Giỏi", min: 8 }, { name: "Khá", min: 6.5 }, { name: "Trung bình", min: 5 }, { name: "Yếu", min: 0 }],
  learning: {
    levels: [
      { name: "Tốt", minEach: 6.5, highScore: 8, highCount: 6, maxFailedComments: 0 },
      { name: "Khá", minEach: 5, highScore: 6.5, highCount: 6, maxFailedComments: 0 },
      { name: "Đạt", minEach: 3.5, highScore: 5, highCount: 6, maxFailedComments: 1 },
      { name: "Chưa đạt", minEach: 0, highScore: 0, highCount: 0, maxFailedComments: 99 },
    ],
    conductLevels: ["Tốt", "Khá", "Đạt", "Chưa đạt"],
  },
  promotion: { maxAbsenceDays: 45, classCapacity: 45, attentionBelow: 5 },
  roomTypes: [{ code: "THUONG", label: "Phòng thường" }, { code: "THI_NGHIEM", label: "Phòng thí nghiệm" }, { code: "MAY_TINH", label: "Phòng máy tính" }, { code: "THE_DUC", label: "Sân / phòng thể dục" }, { code: "KHAC", label: "Khác" }],
  examCategories: [{ code: "GIUA_KY", label: "Giữa kỳ" }, { code: "CUOI_KY", label: "Cuối kỳ" }, { code: "THI_LAI", label: "Thi lại" }, { code: "KHAC", label: "Khác" }],
  diaryRatings: [{ code: "TOT", symbol: "A", label: "Tốt" }, { code: "KHA", symbol: "B", label: "Khá" }, { code: "TB", symbol: "C", label: "Trung bình" }, { code: "YEU", symbol: "D", label: "Yếu" }],
  library: { maxBooksPerStudent: 5 },
};

const name = z.string().trim().min(1, "Tên không được để trống").max(40);
const score = z.number().min(0, "Điểm từ 0 đến 10").max(10, "Điểm từ 0 đến 10");
const catalog = z.array(z.object({ code: z.string().trim().min(1).max(30).regex(/^[A-Z0-9_]+$/, "Mã chỉ gồm chữ HOA, số, gạch dưới"), label: name })).min(1, "Cần ít nhất một mục").max(30);

export const policySchema = z.object({
  gradeScale: z.array(z.object({ name, min: score })).min(2, "Thang xếp loại cần ít nhất 2 mức").max(10),
  learning: z.object({
    levels: z.array(z.object({ name, minEach: score, highScore: score, highCount: z.number().int().min(0).max(30), maxFailedComments: z.number().int().min(0).max(99) })).min(2, "Cần ít nhất 2 mức học lực").max(8),
    conductLevels: z.array(name).min(2, "Cần ít nhất 2 mức rèn luyện").max(8),
  }),
  promotion: z.object({ maxAbsenceDays: z.number().int().min(0).max(366), classCapacity: z.number().int().min(1).max(200), attentionBelow: score }),
  roomTypes: catalog,
  examCategories: catalog,
  diaryRatings: z.array(z.object({ code: z.string().trim().min(1).max(30).regex(/^[A-Z0-9_]+$/, "Mã chỉ gồm chữ HOA, số, gạch dưới"), symbol: z.string().trim().min(1, "Ký hiệu không được để trống").max(3, "Ký hiệu tối đa 3 ký tự"), label: name })).min(2, "Cần ít nhất 2 mức xếp loại tiết học").max(8),
  library: z.object({ maxBooksPerStudent: z.number().int().min(1).max(50) }),
}).superRefine((p, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const mins = p.gradeScale.map((g) => g.min);
  if (mins.some((m, i) => i > 0 && m >= mins[i - 1])) issue("Thang xếp loại: điểm tối thiểu phải GIẢM dần từ mức cao nhất xuống thấp nhất");
  if (mins[mins.length - 1] !== 0) issue("Thang xếp loại: mức thấp nhất phải bắt đầu từ 0 điểm");
  if (new Set(p.gradeScale.map((g) => g.name)).size !== p.gradeScale.length) issue("Thang xếp loại: tên các mức không được trùng");
  if (new Set(p.learning.levels.map((l) => l.name)).size !== p.learning.levels.length) issue("Học lực cả năm: tên các mức không được trùng");
  if (new Set(p.learning.conductLevels).size !== p.learning.conductLevels.length) issue("Rèn luyện: tên các mức không được trùng");
  if (new Set(p.diaryRatings.map((r) => r.code)).size !== p.diaryRatings.length || new Set(p.diaryRatings.map((r) => r.symbol)).size !== p.diaryRatings.length) issue("Xếp loại tiết học: mã và ký hiệu không được trùng");
  for (const c of [p.roomTypes, p.examCategories]) if (new Set(c.map((x) => x.code)).size !== c.length) issue("Danh mục: mã không được trùng");
});

/** Ghép dữ liệu đã lưu với mặc định; dữ liệu hỏng/thiếu thì quay về mặc định (không làm sập hệ thống). */
export function normalizePolicy(raw: unknown): Policy {
  const merged = { ...DEFAULT_POLICY, ...(raw && typeof raw === "object" ? (raw as object) : {}) };
  const parsed = policySchema.safeParse(merged);
  return parsed.success ? (parsed.data as Policy) : DEFAULT_POLICY;
}

/** Xếp loại theo điểm TB theo thang đã cấu hình. */
export function gradeBand(avg: number | null | undefined, scale: GradeBand[] = DEFAULT_POLICY.gradeScale) {
  if (avg == null) return "-";
  return (scale.find((g) => avg >= g.min) ?? scale[scale.length - 1]).name;
}
export const labelOf = (items: CatalogItem[], code: string) => items.find((i) => i.code === code)?.label ?? code;

/** Chữ hiển thị của một mức xếp loại tiết học, vd "A · Tốt". Mã lạ (đã bị xóa khỏi cấu hình) hiện nguyên mã. */
export function ratingText(ratings: DiaryRating[], code: string | null | undefined) {
  if (!code) return "-";
  const r = ratings.find((x) => x.code === code);
  return r ? `${r.symbol} · ${r.label}` : code;
}
/** Màu theo thứ hạng của mức (tốt nhất → xanh lá, kém nhất → đỏ), để đổi cấu hình vẫn đúng màu. */
export function ratingTone(ratings: DiaryRating[], code: string | null | undefined) {
  const i = ratings.findIndex((x) => x.code === code);
  if (i < 0) return "bg-slate-100 text-slate-700";
  const r = ratings.length > 1 ? i / (ratings.length - 1) : 0;
  return r < 0.25 ? "bg-green-100 text-green-800" : r < 0.5 ? "bg-sky-100 text-sky-800" : r < 0.75 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700";
}
