"use server";
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { assertRole, ADMIN_ROLES } from "@/lib/guard";
import { wrap, str, int } from "@/lib/action";
import { parseDate } from "@/lib/format";
import { deleteSharedAcademicYear } from "@/modules/academic/calendar-management";
import { schoolYearIdentity } from "@/modules/academic/school-year-name";
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

/** Đọc một khoảng học kỳ từ form (`${prefix}Start/End/Weeks`): ngày hợp lệ, kết thúc sau bắt đầu, 1–30 tuần. */
function period(fd: FormData, prefix: string, label: string) {
  const s = str(fd, `${prefix}Start`), e = str(fd, `${prefix}End`);
  if (!s || !e) throw new Error(`${label}: chọn ngày bắt đầu và ngày kết thúc`);
  const start = parseDate(s), end = parseDate(e);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error(`${label}: ngày không hợp lệ`);
  if (end <= start) throw new Error(`${label}: ngày kết thúc phải sau ngày bắt đầu`);
  const weeks = Math.ceil(((end.getTime() - start.getTime()) / 86400_000 + 1) / 7), given = int(fd, `${prefix}Weeks`, weeks);
  if (weeks < 1 || weeks > 30 || given < 1 || given > 30) throw new Error(`${label}: thời lượng phải từ 1 đến 30 tuần`);
  return { start, end };
}
const overlap = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start <= b.end && b.start <= a.end;

/* ===== Năm học & học kỳ ===== */
export const addAcademicYear = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const { yearName, schoolYear } = schoolYearIdentity(str(fd, "yearName"));
  const hk1 = period(fd, "hk1", "Học kỳ 1"), hk2 = period(fd, "hk2", "Học kỳ 2");
  if (hk2.start <= hk1.end) throw new Error("Học kỳ 2 phải bắt đầu sau khi học kỳ 1 kết thúc");
  if (await db.academicYear.findUnique({ where: { yearName } })) throw new Error("Năm học này đã tồn tại");
  const year = await db.academicYear.create({ data: {
    yearName, schoolYear, startDate: hk1.start, endDate: hk2.end,
    terms: { create: [{ termName: "HK1", startDate: hk1.start, endDate: hk1.end }, { termName: "HK2", startDate: hk2.start, endDate: hk2.end }] },
  } });
  await audit(me.email, "create", "AcademicYear", year.id);
  done();
  return "Đã thêm năm học cùng HK1 và HK2";
});

export const updateAcademicYear = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  const { yearName, schoolYear } = schoolYearIdentity(str(fd, "yearName"));
  const current = await db.academicYear.findUniqueOrThrow({ where: { id } });
  if (current.schoolYear !== null && current.schoolYear !== schoolYear) throw new Error("Không đổi niên khóa đã liên kết. Hãy tạo năm học mới.");
  const { start, end } = dates(fd);
  if (await db.academicYear.findFirst({ where: { yearName, id: { not: id } } })) throw new Error("Đã có năm học cùng tên");
  const terms = await db.academicTerm.findMany({ where: { academicYearId: id } });
  if (terms.some((t) => t.startDate < start || t.endDate > end)) throw new Error("Thời gian năm học phải bao trùm các học kỳ của năm. Hãy sửa học kỳ trước hoặc dùng nút sửa học kỳ.");
  await db.academicYear.update({ where: { id }, data: { yearName, schoolYear, startDate: start, endDate: end } });
  await audit(me.email, "update", "AcademicYear", id);
  done();
});

export const deleteAcademicYear = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  await deleteSharedAcademicYear(id);
  await audit(me.email, "delete", "AcademicYear", id);
  done();
});

export const addAcademicTerm = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const academicYearId = str(fd, "academicYearId"), termName = str(fd, "termName");
  if (!["HK1", "HK2"].includes(termName)) throw new Error("Chọn học kỳ");
  const p = period(fd, "term", "Học kỳ");
  const year = await db.academicYear.findUniqueOrThrow({ where: { id: academicYearId }, include: { terms: true } });
  if (year.terms.some((t) => t.termName === termName)) throw new Error(`Năm học này đã có ${termName}`);
  const other = year.terms[0];
  if (other && overlap(p, { start: other.startDate, end: other.endDate })) throw new Error(`Thời gian trùng với ${other.termName}`);
  if (other && ((termName === "HK1") !== (p.end < other.startDate))) throw new Error("HK1 phải diễn ra trước HK2");
  if (p.start < year.startDate || p.end > year.endDate) throw new Error("Học kỳ phải nằm trong thời gian của năm học");
  const t = await db.academicTerm.create({ data: { academicYearId, termName, startDate: p.start, endDate: p.end } });
  await syncYearDates(academicYearId);
  await audit(me.email, "create", "AcademicTerm", t.id);
  done();
  return "Đã thêm học kỳ";
});

/** Năm học có đủ HK1 + HK2 thì ngày đầu/cuối năm luôn = đầu HK1 / cuối HK2. */
async function syncYearDates(academicYearId: string) {
  const terms = await db.academicTerm.findMany({ where: { academicYearId } });
  const hk1 = terms.find((t) => t.termName === "HK1"), hk2 = terms.find((t) => t.termName === "HK2");
  if (hk1 && hk2) await db.academicYear.update({ where: { id: academicYearId }, data: { startDate: hk1.startDate, endDate: hk2.endDate } });
}

export const updateAcademicTerm = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  const p = period(fd, "term", "Học kỳ");
  const term = await db.academicTerm.findUniqueOrThrow({ where: { id }, include: { academicYear: { include: { terms: true } } } });
  const other = term.academicYear.terms.find((t) => t.id !== id);
  if (other) {
    if (overlap(p, { start: other.startDate, end: other.endDate })) throw new Error(`Thời gian trùng với ${other.termName}`);
    if ((term.termName === "HK1") !== (p.end < other.startDate)) throw new Error("HK1 phải kết thúc trước khi HK2 bắt đầu");
  } else if (p.start < term.academicYear.startDate || p.end > term.academicYear.endDate) throw new Error("Học kỳ phải nằm trong thời gian của năm học");
  await db.academicTerm.update({ where: { id }, data: { startDate: p.start, endDate: p.end } });
  await syncYearDates(term.academicYearId);
  await audit(me.email, "update", "AcademicTerm", id);
  done();
  revalidatePath("/");
  return "Đã lưu học kỳ";
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
  updateTag("catalog");
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
  updateTag("catalog");
  await audit(me.email, "update", "GradeLevel", id);
  done();
});

export const deleteGradeLevel = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  if (await db.schoolClass.count({ where: { gradeLevelId: id } })) throw new Error("Khối đang có lớp, không thể xoá");
  if (await db.examEvent.count({ where: { gradeLevelId: id } })) throw new Error("Khối đã có lịch thi, không thể xóa");
  await db.gradeLevel.delete({ where: { id } });
  updateTag("catalog");
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
  updateTag("school-setting");
  revalidatePath("/", "layout");
  return "Đã lưu giao diện";
});

export const removeSchoolLogo = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const old = await db.schoolSetting.findUnique({ where: { id: "school" } });
  if (old?.logoPublicId) await deleteImage(old.logoPublicId);
  await db.schoolSetting.update({ where: { id: "school" }, data: { logoUrl: null, logoPublicId: null } });
  await audit(me.email, "settings", "SchoolSetting", "school");
  updateTag("school-setting");
  revalidatePath("/", "layout");
  void fd;
  return "Đã xoá logo";
});
