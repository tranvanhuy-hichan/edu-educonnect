"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRole, MANAGER_ROLES } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { createYearEndResult, runClassPromotionJob } from "@/modules/promotion/promotion.service";

const RESULTS = ["LEN_LOP", "O_LAI", "THI_LAI"] as const;

/** Ghi kết quả cuối năm 1 học sinh. Quản lý ghi cho mọi học sinh; GVCN chỉ ghi cho học sinh lớp mình (kiểm tra trong service). */
export const saveYearResult = wrap(async (fd) => {
  const me = await assertRole("HOMEROOM_TEACHER", ...MANAGER_ROLES);
  const studentId = str(fd, "studentId"), academicYearId = str(fd, "academicYearId");
  const result = str(fd, "result") as (typeof RESULTS)[number];
  if (!RESULTS.includes(result)) throw new Error("Chọn kết quả cuối năm");
  const avg = Number(str(fd, "overallAverage").replace(",", "."));
  if (!Number.isFinite(avg) || avg < 0 || avg > 10) throw new Error("Điểm trung bình cả năm phải từ 0 đến 10");
  await createYearEndResult(me, { studentId, academicYearId, overallAverage: Math.round(avg * 100) / 100, conductRank: opt(fd, "conductRank") ?? undefined, result });
  await audit(me.email, "save_year_result", "YearEndResult", studentId);
  revalidatePath("/len-lop");
  revalidatePath("/lop-chu-nhiem");
  return "Đã lưu";
});

/** Lưu kết quả cuối năm cả lớp một lần: mỗi học sinh có result_<id>, conduct_<id>, avg_<id>; dòng chưa chọn kết quả thì bỏ qua. */
export const saveClassResults = wrap(async (fd) => {
  const me = await assertRole("HOMEROOM_TEACHER", ...MANAGER_ROLES);
  const academicYearId = str(fd, "academicYearId");
  let n = 0;
  for (const id of str(fd, "ids").split(",").filter(Boolean)) {
    const result = str(fd, `result_${id}`) as (typeof RESULTS)[number];
    if (!result) continue;
    if (!RESULTS.includes(result)) throw new Error("Kết quả không hợp lệ");
    const avg = Number(str(fd, `avg_${id}`).replace(",", ".")) || 0;
    await createYearEndResult(me, { studentId: id, academicYearId, overallAverage: Math.round(avg * 100) / 100, conductRank: opt(fd, `conduct_${id}`) ?? undefined, result });
    n++;
  }
  if (!n) throw new Error("Chưa chọn kết quả cho học sinh nào");
  await audit(me.email, "save_class_results", "YearEndResult", academicYearId);
  revalidatePath("/len-lop");
  revalidatePath("/lop-chu-nhiem");
  return `Đã lưu kết quả cho ${n} học sinh`;
});

/** Chạy lên lớp: học sinh "Lên lớp" của mỗi lớp nguồn vào lớp đích đã chọn; "Ở lại" vào lớp ở lại (nếu chọn); "Thi lại" giữ nguyên chờ xử lý. */
export const runPromotion = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const fromId = str(fd, "fromYearId"), toId = str(fd, "toYearId");
  if (!fromId || !toId) throw new Error("Chọn năm học nguồn và năm học đích");
  if (fromId === toId) throw new Error("Năm học đích phải khác năm học nguồn");
  const [fromClasses, toClasses] = await Promise.all([
    db.schoolClass.findMany({ where: { academicYearId: fromId }, orderBy: { className: "asc" } }),
    db.schoolClass.findMany({ where: { academicYearId: toId }, select: { id: true } }),
  ]);
  const validTarget = new Set(toClasses.map((c) => c.id));
  const assignments: { studentId: string; targetSchoolClassId: string }[] = [];
  for (const c of fromClasses) {
    const up = str(fd, `up_${c.id}`), stay = str(fd, `stay_${c.id}`);
    for (const t of [up, stay]) if (t && !validTarget.has(t)) throw new Error(`Lớp đích của ${c.className} không thuộc năm học đích`);
    const rs = await db.yearEndResult.findMany({ where: { academicYearId: fromId, student: { enrollments: { some: { schoolClassId: c.id, academicYearId: fromId } } } }, select: { studentId: true, result: true } });
    const ups = rs.filter((r) => r.result === "LEN_LOP"), stays = rs.filter((r) => r.result === "O_LAI");
    if (ups.length && !up) throw new Error(`Chọn lớp đích cho học sinh lên lớp của ${c.className}`);
    for (const r of ups) assignments.push({ studentId: r.studentId, targetSchoolClassId: up });
    if (stay) for (const r of stays) assignments.push({ studentId: r.studentId, targetSchoolClassId: stay });
  }
  if (!assignments.length) throw new Error("Chưa có học sinh nào đủ điều kiện để chuyển (cần ghi kết quả cuối năm trước)");
  const job = await runClassPromotionJob(me, { academicYearFromId: fromId, academicYearToId: toId, assignments });
  await audit(me.email, "run_promotion", "ClassPromotionJob", job.id);
  revalidatePath("/len-lop");
  return `Đã xếp ${job.enrollmentsCreated}/${assignments.length} học sinh vào lớp của năm học mới`;
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

  await db.yearEndResult.update({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    data: {
      result,
      overallAverage: Math.round(score * 100) / 100,
    },
  });

  await audit(me.email, "resolve_re_exam", "YearEndResult", `${studentId}_${academicYearId}`);
  revalidatePath("/len-lop");
  revalidatePath("/lop-chu-nhiem");
  return `Đã cập nhật kết quả thi lại: ${result === "LEN_LOP" ? "Lên lớp" : "Ở lại"}`;
});
