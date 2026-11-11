"use server";
import { revalidatePath } from "next/cache";
import { assertRole, MANAGER_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { createYearEndResult, submitClassResults, promoteClasses, reviewYearResult, resolveReExam } from "@/modules/promotion/promotion.service";


/** Ghi kết quả cuối năm 1 học sinh. Quản lý ghi cho mọi học sinh; GVCN chỉ ghi cho học sinh lớp mình (kiểm tra trong service). */
export const saveYearResult = wrap(async (fd) => {
  const me = await assertRole("HOMEROOM_TEACHER", ...MANAGER_ROLES);
  const studentId = str(fd, "studentId"), academicYearId = str(fd, "academicYearId");
  await createYearEndResult(me, { studentId, academicYearId, conductRank: (opt(fd, "conductRank") ?? undefined) as string | undefined, absenceDays: str(fd, "absenceDays") === "" ? null : Number(str(fd, "absenceDays")), result: "CHUA_DU_DIEU_KIEN" });
  revalidatePath("/len-lop");
  revalidatePath("/lop-chu-nhiem");
  return "Đã lưu";
});

/** Tổng hợp và trình kết quả cả lớp trong một giao dịch; server tự tính lại từ từng môn. */
export const saveClassResults = wrap(async (fd) => {
  const me = await assertRole("HOMEROOM_TEACHER", ...MANAGER_ROLES);
  const academicYearId = str(fd, "academicYearId");
  const ids = [...new Set(str(fd, "ids").split(",").filter(Boolean))].sort();
  await submitClassResults(me, academicYearId, ids.map((id) => ({ studentId: id, academicYearId, conductRank: (opt(fd, `conduct_${id}`) ?? undefined) as string | undefined, absenceDays: str(fd, `absence_${id}`) === "" ? null : Number(str(fd, `absence_${id}`)), result: "CHUA_DU_DIEU_KIEN" })));
  revalidatePath("/len-lop");
  revalidatePath("/lop-chu-nhiem");
  return `Đã tổng hợp ${ids.length} học sinh. Hồ sơ đủ dữ liệu được chuyển sang chờ duyệt; hồ sơ thiếu giữ ở bản nháp.`;
});

/** Chạy lên lớp: học sinh "Lên lớp" của mỗi lớp nguồn vào lớp đích đã chọn; "Ở lại" vào lớp ở lại (nếu chọn); "Thi lại" giữ nguyên chờ xử lý. */
export const runPromotion = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const fromId = str(fd, "fromYearId"), toId = str(fd, "toYearId");
  const routes = [...fd.keys()].filter((key) => key.startsWith("up_")).map((key) => ({ classId: key.slice(3), up: str(fd, key), stay: str(fd, `stay_${key.slice(3)}`) }));
  const result = await promoteClasses(me, { fromYearId: fromId, toYearId: toId, routes });
  revalidatePath("/len-lop");
  return `Đã xếp ${result.created}/${result.total} học sinh vào lớp của năm học mới`;
});

/** Cập nhật kết quả thi lại: cập nhật điểm sau thi lại và đổi kết quả thành LEN_LOP hoặc O_LAI. */
export const resolveReExamResult = wrap(async (fd) => {
  const me = await assertRole("HOMEROOM_TEACHER", ...MANAGER_ROLES);
  const studentId = str(fd, "studentId");
  const academicYearId = str(fd, "academicYearId");
  const result = str(fd, "result") as "LEN_LOP" | "O_LAI";
  if (!["LEN_LOP", "O_LAI"].includes(result)) throw new Error("Kết quả sau thi lại phải là Lên lớp hoặc Ở lại");
  const score = Number(str(fd, "score").replace(",", "."));
  if (!Number.isFinite(score) || score < 0 || score > 10) throw new Error("Điểm sau thi lại phải từ 0 đến 10");

  await resolveReExam(me, { studentId, academicYearId, result, score });

  revalidatePath("/len-lop");
  revalidatePath("/lop-chu-nhiem");
  return "Đã ghi nhận đề xuất đánh giá lại. Cần cập nhật kết quả từng môn và trình duyệt lại; điểm cả năm không bị ghi đè.";
});

export const reviewResult = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  await reviewYearResult(me, str(fd, "studentId"), str(fd, "academicYearId"), str(fd, "approve") === "true", str(fd, "reason"));
  revalidatePath("/len-lop"); revalidatePath("/lop-chu-nhiem");
  return "Đã cập nhật trạng thái hồ sơ";
});
