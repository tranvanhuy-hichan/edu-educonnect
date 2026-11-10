"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRole, ADMIN_ROLES } from "@/lib/guard";
import { wrap, str, int } from "@/lib/action";
import { addDays, parseDate } from "@/lib/format";
import { audit } from "@/lib/audit";
import { deleteImage, isCloudinaryConfigured, uploadSchoolLogo } from "@/lib/cloudinary";
import * as scoringService from "@/modules/scoring/scoring.service";

const done = () => revalidatePath("/cau-hinh");
const num = (fd: FormData, k: string) => Number(str(fd, k).replace(",", "."));

function dates(fd: FormData) {
  const s = str(fd, "startDate"), e = str(fd, "endDate");
  if (!s || !e) throw new Error("Chọn ngày bắt đầu và kết thúc");
  const start = parseDate(s), end = parseDate(e);
  if (end <= start) throw new Error("Ngày kết thúc phải sau ngày bắt đầu");
  return { start, end };
}

/* ===== Năm học & học kỳ ===== */
export const addAcademicYear = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const yearName = str(fd, "yearName");
  if (!yearName) throw new Error("Nhập tên năm học (vd 2027-2028)");
  const { start, end } = dates(fd);
  if (await db.academicYear.findUnique({ where: { yearName } })) throw new Error("Năm học này đã tồn tại");
  const year = await db.academicYear.create({ data: { yearName, startDate: start, endDate: end } });
  if (fd.get("createTerms") === "on") {
    const mid = addDays(start, Math.floor((end.getTime() - start.getTime()) / 86400_000 / 2));
    await db.academicTerm.createMany({ data: [
      { academicYearId: year.id, termName: "HK1", startDate: start, endDate: mid },
      { academicYearId: year.id, termName: "HK2", startDate: addDays(mid, 1), endDate: end },
    ] });
  }
  await audit(me.email, "create", "AcademicYear", year.id);
  done();
  return "Đã thêm năm học";
});

export const updateAcademicYear = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id"), yearName = str(fd, "yearName");
  if (!yearName) throw new Error("Nhập tên năm học");
  const { start, end } = dates(fd);
  if (await db.academicYear.findFirst({ where: { yearName, id: { not: id } } })) throw new Error("Đã có năm học cùng tên");
  await db.academicYear.update({ where: { id }, data: { yearName, startDate: start, endDate: end } });
  await audit(me.email, "update", "AcademicYear", id);
  done();
});

export const deleteAcademicYear = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  const [classes, enrollments] = await Promise.all([db.schoolClass.count({ where: { academicYearId: id } }), db.studentClassEnrollment.count({ where: { academicYearId: id } })]);
  if (classes || enrollments) throw new Error("Năm học đã có lớp/học sinh, không thể xoá");
  const terms = await db.academicTerm.findMany({ where: { academicYearId: id }, select: { id: true } });
  const used = await db.classSubjectAssignment.count({ where: { academicTermId: { in: terms.map((t) => t.id) } } });
  if (used) throw new Error("Học kỳ của năm học này đã có phân công giảng dạy, không thể xoá");
  await db.scoreWeightConfig.deleteMany({ where: { academicTermId: { in: terms.map((t) => t.id) } } });
  await db.academicTerm.deleteMany({ where: { academicYearId: id } });
  await db.academicYear.delete({ where: { id } });
  await audit(me.email, "delete", "AcademicYear", id);
  done();
});

export const addAcademicTerm = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const academicYearId = str(fd, "academicYearId"), termName = str(fd, "termName");
  if (!["HK1", "HK2"].includes(termName)) throw new Error("Chọn học kỳ");
  const { start, end } = dates(fd);
  if (await db.academicTerm.findUnique({ where: { academicYearId_termName: { academicYearId, termName } } })) throw new Error(`Năm học này đã có ${termName}`);
  const t = await db.academicTerm.create({ data: { academicYearId, termName, startDate: start, endDate: end } });
  await audit(me.email, "create", "AcademicTerm", t.id);
  done();
  return "Đã thêm học kỳ";
});

export const deleteAcademicTerm = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  const [a, s, e] = await Promise.all([db.classSubjectAssignment.count({ where: { academicTermId: id } }), db.timetableVersion.count({ where: { academicTermId: id } }), db.scoreEntry.count({ where: { academicTermId: id } })]);
  if (a || s || e) throw new Error("Học kỳ đã có phân công / thời khóa biểu / điểm, không thể xoá");
  await db.scoreWeightConfig.deleteMany({ where: { academicTermId: id } });
  if (await db.examEvent.count({ where: { academicTermId: id } })) throw new Error("Học kỳ đã có lịch thi, không thể xóa");
  await db.academicTerm.delete({ where: { id } });
  await audit(me.email, "delete", "AcademicTerm", id);
  done();
});

/* ===== Khối lớp ===== */
export const addGradeLevel = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const gradeName = str(fd, "gradeName");
  if (!gradeName) throw new Error("Nhập tên khối (vd Khối 11)");
  if (await db.gradeLevel.findUnique({ where: { gradeName } })) throw new Error("Khối này đã tồn tại");
  const g = await db.gradeLevel.create({ data: { gradeName, sortOrder: int(fd, "sortOrder", 0) } });
  await audit(me.email, "create", "GradeLevel", g.id);
  done();
  return "Đã thêm khối";
});

export const updateGradeLevel = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id"), gradeName = str(fd, "gradeName");
  if (!gradeName) throw new Error("Nhập tên khối");
  if (await db.gradeLevel.findFirst({ where: { gradeName, id: { not: id } } })) throw new Error("Đã có khối cùng tên");
  await db.gradeLevel.update({ where: { id }, data: { gradeName, sortOrder: int(fd, "sortOrder", 0) } });
  await audit(me.email, "update", "GradeLevel", id);
  done();
});

export const deleteGradeLevel = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  if (await db.schoolClass.count({ where: { gradeLevelId: id } })) throw new Error("Khối đang có lớp, không thể xoá");
  if (await db.examEvent.count({ where: { gradeLevelId: id } })) throw new Error("Khối đã có lịch thi, không thể xóa");
  await db.gradeLevel.delete({ where: { id } });
  await audit(me.email, "delete", "GradeLevel", id);
  done();
});

/* ===== Hệ số điểm (do ADMIN quy định, không hardcode) ===== */
export const saveScoreWeights = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const academicTermId = str(fd, "academicTermId");
  const txWeight = num(fd, "txWeight"), gkWeight = num(fd, "gkWeight"), ckWeight = num(fd, "ckWeight");
  if (![txWeight, gkWeight, ckWeight].every((v) => Number.isFinite(v) && v > 0 && v <= 10)) throw new Error("Hệ số phải là số lớn hơn 0 (tối đa 10)");
  await scoringService.upsertScoreWeightConfig(me, { academicTermId, txWeight, gkWeight, ckWeight });
  // Điểm TB đã tính theo hệ số cũ: tính lại theo công thức mới cho cả học kỳ
  const pairs = await db.scoreEntry.findMany({ where: { academicTermId }, distinct: ["studentId", "assignmentId"], select: { studentId: true, assignmentId: true } });
  for (const p of pairs) await scoringService.recalculateSubjectTermAverage(p.studentId, p.assignmentId, academicTermId);
  await audit(me.email, "settings", "ScoreWeightConfig", academicTermId);
  done();
  return pairs.length ? `Đã lưu hệ số và tính lại điểm trung bình của ${pairs.length} học sinh–môn` : "Đã lưu hệ số điểm";
});

/* ===== Giao diện: tên trường & logo ===== */
export const updateSchoolBrand = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const schoolName = str(fd, "schoolName");
  if (!schoolName) throw new Error("Nhập tên trường");

  const file = fd.get("logo");
  const data: { schoolName: string; logoUrl?: string; logoPublicId?: string } = { schoolName };

  if (file instanceof File && file.size > 0) {
    if (!isCloudinaryConfigured()) throw new Error("Chưa cấu hình Cloudinary trên máy chủ (thiếu biến môi trường)");
    if (!file.type.startsWith("image/")) throw new Error("Logo phải là ảnh (PNG/JPG/SVG...)");
    if (file.size > 5 * 1024 * 1024) throw new Error("Ảnh logo tối đa 5MB");
    const buffer = Buffer.from(await file.arrayBuffer());
    const old = await db.schoolSetting.findUnique({ where: { id: "school" }, select: { logoPublicId: true } });
    const res = await uploadSchoolLogo(buffer);
    data.logoUrl = res.secure_url;
    data.logoPublicId = res.public_id;
    if (old?.logoPublicId && old.logoPublicId !== res.public_id) await deleteImage(old.logoPublicId);
  }

  await db.schoolSetting.upsert({ where: { id: "school" }, update: data, create: { id: "school", ...data } });
  await audit(me.email, "settings", "SchoolSetting", "school");
  revalidatePath("/", "layout");
  return "Đã lưu giao diện";
});

export const removeSchoolLogo = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const old = await db.schoolSetting.findUnique({ where: { id: "school" } });
  if (old?.logoPublicId) await deleteImage(old.logoPublicId);
  await db.schoolSetting.update({ where: { id: "school" }, data: { logoUrl: null, logoPublicId: null } });
  await audit(me.email, "settings", "SchoolSetting", "school");
  revalidatePath("/", "layout");
  void fd;
  return "Đã xoá logo";
});
