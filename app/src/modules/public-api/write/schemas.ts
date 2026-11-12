import { z } from "zod";

/** Dữ liệu API ghi: kiểm tra chặt (từ chối trường lạ để gõ nhầm tên không bị lặng lẽ bỏ qua), giới hạn độ dài, ngày YYYY-MM-DD hợp lệ thật. */
const txt = (max: number) => z.string().trim().min(1).max(max);
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD").refine((v) => { const d = new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }, "Ngày không hợp lệ");
const gender = z.enum(["MALE", "FEMALE", "OTHER"]);
const phone = z.string().trim().regex(/^[0-9+().\s-]{6,20}$/, "Số điện thoại không hợp lệ");
const email = z.string().trim().toLowerCase().email("Email không hợp lệ").max(120);
const nonEmpty = (o: object) => Object.keys(o).length > 0;
const nonEmptyMsg = { message: "Cần gửi ít nhất một trường để cập nhật" };

export const contactSchema = z.object({ phone: phone.nullable(), email: email.nullable(), address: txt(250).nullable() }).partial().strict();
export const guardianSchema = z.object({ name: txt(120).nullable(), relation: txt(40).nullable(), phone: phone.nullable(), email: email.nullable() }).partial().strict();
export const identitySchema = z.object({ idNumber: z.string().trim().regex(/^\d{9,12}$/, "CCCD/CMND gồm 9–12 chữ số").nullable(), birthPlace: txt(120).nullable(), ethnicity: txt(40).nullable() }).partial().strict();

export const studentCreate = z.object({
  fullName: txt(120), dateOfBirth: day.nullable().optional(), gender: gender.nullable().optional(),
  classId: txt(60).optional().describe("Xếp vào lớp này (theo năm học của lớp)"), effectiveDate: day.optional(),
  contact: contactSchema.optional(), guardian: guardianSchema.optional(), identity: identitySchema.optional(),
}).strict();
export const studentPatch = z.object({
  fullName: txt(120).optional(), dateOfBirth: day.nullable().optional(), gender: gender.nullable().optional(),
  contact: contactSchema.optional(), guardian: guardianSchema.optional(), identity: identitySchema.optional(),
}).strict().refine(nonEmpty, nonEmptyMsg);
export const studentClass = z.object({ classId: txt(60), effectiveDate: day, reason: txt(300).min(5, "Lý do ít nhất 5 ký tự"), decisionReference: txt(120).min(3, "Số quyết định/căn cứ ít nhất 3 ký tự") }).strict();
export const youthPatch = z.object({
  isMember: z.boolean().optional(), joinedAt: day.nullable().optional(), branch: txt(120).nullable().optional(), position: txt(120).nullable().optional(), note: txt(300).nullable().optional(),
}).strict().refine(nonEmpty, nonEmptyMsg);

export const teacherCreate = z.object({
  fullName: txt(120), loginEmail: email.describe("Email đăng nhập (duy nhất)"), gender: gender.nullable().optional(), dateOfBirth: day.nullable().optional(),
  degree: txt(120).nullable().optional(), startDate: day.nullable().optional(), subjectIds: z.array(txt(60)).max(30).optional(), contact: contactSchema.optional(),
}).strict();
export const teacherPatch = z.object({
  fullName: txt(120).optional(), gender: gender.nullable().optional(), dateOfBirth: day.nullable().optional(), degree: txt(120).nullable().optional(),
  startDate: day.nullable().optional(), subjectIds: z.array(txt(60)).max(30).optional(), contact: contactSchema.optional(),
}).strict().refine(nonEmpty, nonEmptyMsg);

export const classCreate = z.object({
  name: txt(30), gradeId: txt(60), year: txt(60).optional().describe("Mã hoặc tên năm học; mặc định năm học hiện hành"), roomId: txt(60),
  shift: z.enum(["MORNING", "AFTERNOON"]).optional(), homeroomTeacherId: txt(60).nullable().optional(), subjectIds: z.array(txt(60)).min(1, "Chọn ít nhất một môn học").max(60),
}).strict();
export const classPatch = z.object({
  name: txt(30).optional(), roomId: txt(60).optional(), shift: z.enum(["MORNING", "AFTERNOON"]).optional(), homeroomTeacherId: txt(60).nullable().optional(),
}).strict().refine(nonEmpty, nonEmptyMsg);

export type StudentCreate = z.infer<typeof studentCreate>;
export type StudentPatch = z.infer<typeof studentPatch>;
export type YouthPatch = z.infer<typeof youthPatch>;
export type TeacherCreate = z.infer<typeof teacherCreate>;
export type TeacherPatch = z.infer<typeof teacherPatch>;
export type ClassCreate = z.infer<typeof classCreate>;
export type ClassPatch = z.infer<typeof classPatch>;
