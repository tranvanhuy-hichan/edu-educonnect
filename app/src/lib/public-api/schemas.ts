import { z } from "zod";

/** Mô tả dữ liệu của API ngoài (dùng cho OpenAPI). Khớp với DTO trong modules/public-api/public-api.service.ts. */
const ref = z.object({ id: z.string(), name: z.string() });
export const PageMeta = z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() });
export const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string().optional(), required: z.array(z.string()).optional(), details: z.array(z.object({ parameter: z.string(), message: z.string() })).optional() }) });

export const YearDto = z.object({ id: z.string(), name: z.string(), startDate: z.string().describe("YYYY-MM-DD"), endDate: z.string(), current: z.boolean() });
export const GradeDto = z.object({ id: z.string(), name: z.string().describe("Khối 10"), order: z.number(), classCount: z.number(), studentCount: z.number() });
export const ClassDto = z.object({
  id: z.string(), name: z.string().describe("10A1"), grade: ref.extend({ order: z.number() }), academicYear: ref, shift: z.string(),
  homeroomTeacher: z.object({ id: z.string(), code: z.string().nullable(), fullName: z.string() }).nullable(), studentCount: z.number(),
});
export const StudentDto = z.object({
  id: z.string(), code: z.string().nullable().describe("Mã học sinh"), fullName: z.string(), gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable(), dateOfBirth: z.string().nullable().describe("YYYY-MM-DD"),
  status: z.enum(["active", "locked"]), class: ref.nullable(), grade: ref.nullable(), academicYear: ref.nullable(),
  contact: z.object({ phone: z.string().nullable(), email: z.string().nullable(), address: z.string().nullable() }).optional().describe("Chỉ có khi khoá được cấp students:contact"),
  guardian: z.object({ name: z.string().nullable(), relation: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable() }).optional().describe("Chỉ có khi khoá được cấp students:contact"),
  identity: z.object({ idNumber: z.string().nullable(), birthPlace: z.string().nullable(), ethnicity: z.string().nullable() }).optional().describe("Chỉ có khi khoá được cấp students:identity"),
});
export const TeacherDto = z.object({
  id: z.string(), code: z.string().nullable(), fullName: z.string(), gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable(), status: z.enum(["active", "locked"]),
  subjects: z.array(ref), homeroomClasses: z.array(ref).describe("Lớp chủ nhiệm trong năm học được chọn"),
  contact: z.object({ phone: z.string().nullable(), email: z.string().nullable() }).optional().describe("Chỉ có khi khoá được cấp teachers:contact"),
});
