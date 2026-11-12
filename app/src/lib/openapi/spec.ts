import { z } from "zod";
import { loginSchema } from "@/modules/auth/auth.schema";
import { classCreate, classPatch, studentClass, studentCreate, studentPatch, teacherCreate, teacherPatch, youthPatch } from "@/modules/public-api/write/schemas";
import { ClassDto, ErrorBody as PublicError, GradeDto, PageMeta, StudentDto, TeacherDto, YearDto } from "@/lib/public-api/schemas";

/**
 * Mô tả API công khai của EduConnect (OpenAPI 3.1). Schema sinh trực tiếp từ Zod nên không lệch với mã kiểm tra thật:
 * sửa loginSchema thì tài liệu đổi theo. Lấy bản JSON tại /api/openapi.json hoặc `npm run openapi`.
 */
const json = (s: z.ZodType) => ({ "application/json": { schema: z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) } });
const out = (s: z.ZodType) => ({ "application/json": { schema: z.toJSONSchema(s, { io: "output", unrepresentable: "any" }) } });

const ErrorBody = z.object({ error: z.string(), requestId: z.string().optional().describe("Mã truy vết, quản trị tra trong /van-hanh hoặc log") });
const SessionUserBody = z.object({ data: z.object({ userId: z.string(), email: z.string(), roles: z.array(z.string()), teacherId: z.string().nullable(), studentId: z.string().nullable() }) });
const err = (description: string) => ({ description, content: out(ErrorBody) });
const cookieAuth = [{ cookieAuth: [] }];

const q = (name: string, description: string, extra: object = { type: "string" }) => ({ name, in: "query", required: false, description, schema: extra });
const PAGING = [q("page", "Trang (từ 1)", { type: "integer", minimum: 1, default: 1 }), q("pageSize", "Số dòng mỗi trang (tối đa 200)", { type: "integer", minimum: 1, maximum: 200, default: 50 })];
const YEAR = q("year", "Mã hoặc tên năm học (vd 2026-2027). Mặc định: năm học hiện hành.");
const pub = (description: string) => ({ description, content: out(PublicError) });
const ERR = { "401": pub("Thiếu, sai, hết hạn hoặc đã thu hồi khoá API"), "403": pub("Khoá chưa được cấp quyền, hoặc IP không nằm trong danh sách cho phép"), "429": pub("Vượt giới hạn tốc độ (header Retry-After)") };
const list = (item: z.ZodType) => out(z.object({ data: z.array(item), meta: PageMeta }));
const one = (item: z.ZodType) => out(z.object({ data: item }));
const op = (summary: string, scope: string, description: string, parameters: object[], ok: object, extra: object = {}) => ({ get: { tags: ["API ngoài (v1)"], summary, description: `${description}\n\nQuyền cần có: \`${scope}\`.`, security: [{ apiKeyBearer: [] }], parameters, responses: { "200": { description: "OK", content: ok }, "400": pub("Tham số không hợp lệ"), ...ERR, ...extra } } });
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };
const NOT_FOUND = { "404": pub("Không tìm thấy") };

function baseSpec() {
  return {
    openapi: "3.1.0",
    info: { title: "EduConnect API", version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", description: "API nội bộ của EduConnect. Đăng nhập bằng cookie phiên (HttpOnly). Lỗi 5xx luôn kèm requestId." },
    servers: [{ url: process.env.NEXT_PUBLIC_APP_URL || "/" }],
    components: { securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "educonnect_session" }, cronBearer: { type: "http", scheme: "bearer", description: "CRON_SECRET" }, apiKeyBearer: { type: "http", scheme: "bearer", bearerFormat: "ek_…", description: "Khoá API do quản trị cấp tại /ket-noi-api. Gửi trong header Authorization: Bearer <khoá>. Không gửi khoá trên URL." } } },
    tags: [{ name: "API ngoài (v1)", description: "API chỉ đọc cho hệ thống bên ngoài, xác thực bằng khoá API." }, { name: "Auth" }, { name: "Files" }, { name: "Import" }, { name: "Notifications" }, { name: "Search" }, { name: "Ops" }],
    paths: {
      "/api/auth/login": { post: { tags: ["Auth"], summary: "Đăng nhập (email hoặc mã học sinh)", description: "Giới hạn 10 lần/15 phút theo tài khoản; sai quá mức trả 401 như sai mật khẩu.", requestBody: { required: true, content: json(loginSchema) }, responses: { "200": { description: "Thành công, đặt cookie phiên", content: out(SessionUserBody) }, "400": err("Dữ liệu không hợp lệ"), "401": err("Sai thông tin hoặc bị giới hạn") } } },
      "/api/auth/logout": { post: { tags: ["Auth"], summary: "Đăng xuất", security: cookieAuth, responses: { "200": { description: "Đã xoá cookie" } } } },
      "/api/auth/me": { get: { tags: ["Auth"], summary: "Người dùng hiện tại", security: cookieAuth, responses: { "200": { description: "OK", content: out(SessionUserBody) }, "401": err("Chưa đăng nhập") } } },
      "/api/uploads": { post: { tags: ["Files"], summary: "Tải tệp lên kho lưu trữ", description: "multipart/form-data: file, purpose, assignmentId?, exerciseId?. Tối đa UPLOAD_MAX_MB (≤10MB). Giới hạn 30 lần/phút/người.", security: cookieAuth, responses: { "201": { description: "Đã lưu", content: out(z.object({ id: z.string(), url: z.string(), name: z.string(), size: z.number() })) }, "400": err("Tệp/tham số không hợp lệ"), "403": err("Không có quyền"), "413": err("Tệp quá lớn"), "429": err("Quá nhiều yêu cầu (Retry-After)") } } },
      "/api/files/{id}": { get: { tags: ["Files"], summary: "Tải tệp (chuyển hướng 307 tới URL ký có thời hạn)", security: cookieAuth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "307": { description: "Redirect" }, "404": err("Không có tệp/quyền") } } },
      "/api/imports": { post: { tags: ["Import"], summary: "Tạo phiên nhập câu hỏi/đề từ tệp bằng AI", description: "multipart/form-data: file, kind (QUESTIONS|TEST), subjectId, gradeLevelId, libraryLessonId?. Chỉ giáo viên. Xử lý nền qua hàng đợi; 5 lần/10 phút và AI_IMPORT_DAILY_LIMIT/24h.", security: cookieAuth, responses: { "201": { description: "Đã xếp hàng", content: out(z.object({ id: z.string() })) }, "400": err("Không hợp lệ hoặc vượt hạn mức ngày"), "429": err("Quá nhiều yêu cầu") } } },
      "/api/notifications": {
        get: { tags: ["Notifications"], summary: "Thông báo của tôi", security: cookieAuth, responses: { "200": { description: "OK", content: out(z.object({ notifications: z.array(z.unknown()), unreadCount: z.number() })) } } },
        post: { tags: ["Notifications"], summary: "Đánh dấu đã đọc", security: cookieAuth, requestBody: { content: json(z.object({ action: z.literal("read_all").optional(), id: z.string().optional() })) }, responses: { "200": { description: "OK" }, "400": err("Hành động không hợp lệ") } },
      },
      "/api/search": { get: { tags: ["Search"], summary: "Tìm nhanh học sinh, giáo viên, lớp, tài khoản", description: "?q= tối thiểu 2 ký tự. Kết quả giới hạn theo vai trò: học sinh → Admin/Ban giám hiệu; giáo viên và lớp → thêm giáo viên; tài khoản → chỉ Admin. 90 lần/phút/người.", security: cookieAuth, parameters: [{ name: "q", in: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 60 } }], responses: { "200": { description: "Các nhóm kết quả (mỗi nhóm tối đa 5 dòng, more=true nếu còn)", content: out(z.object({ groups: z.array(z.object({ key: z.string(), label: z.string(), listHref: z.string(), more: z.boolean(), items: z.array(z.object({ id: z.string(), label: z.string(), sub: z.string(), href: z.string() })) })) })) }, "401": err("Chưa đăng nhập"), "429": err("Quá nhiều yêu cầu") } } },
      "/api/parent/notifications": {
        get: { tags: ["Notifications"], summary: "Thông báo của phụ huynh (điểm mới, công bố điểm, vắng mặt)", description: "Xác thực bằng cookie Cổng Phụ huynh (educonnect_parent_token), không dùng cookie cán bộ.", responses: { "200": { description: "OK", content: out(z.object({ notifications: z.array(z.unknown()), unreadCount: z.number() })) }, "401": err("Chưa đăng nhập cổng phụ huynh") } },
        post: { tags: ["Notifications"], summary: "Đánh dấu đã đọc", requestBody: { content: json(z.object({ action: z.literal("read_all").optional(), id: z.string().optional() })) }, responses: { "200": { description: "OK" }, "400": err("Hành động không hợp lệ"), "403": err("Sai nguồn gốc yêu cầu") } },
      },
      "/api/v1/me": op("Kiểm tra khoá và kết nối", "(không cần quyền dữ liệu)", "Trả tên khoá, các quyền được cấp, giới hạn tốc độ và hạn dùng.", [], one(z.object({ name: z.string(), scopes: z.array(z.string()), rateLimitPerMin: z.number(), expiresAt: z.string().nullable() }))),
      "/api/v1/academic-years": op("Danh sách năm học", "years:read", "Năm học mới nhất trước; `current` đánh dấu năm học hiện hành.", [], one(z.array(YearDto))),
      "/api/v1/grades": op("Danh sách khối", "grades:read", "Mỗi khối kèm số lớp và số học sinh trong năm học được chọn.", [YEAR], one(z.array(GradeDto))),
      "/api/v1/classes": op("Danh sách lớp", "classes:read", "Lớp của một năm học, kèm khối, giáo viên chủ nhiệm và sĩ số.", [YEAR, q("grade", "Lọc theo mã khối"), q("q", "Tìm theo tên lớp"), ...PAGING], list(ClassDto)),
      "/api/v1/classes/{id}": op("Chi tiết một lớp", "classes:read", "", [idParam], one(ClassDto), NOT_FOUND),
      "/api/v1/classes/{id}/students": op("Học sinh của một lớp", "classes:read + students:read", "Cùng dạng dữ liệu như /students. Trường liên hệ/định danh chỉ có khi khoá được cấp quyền tương ứng.", [idParam, YEAR, q("q", "Tìm theo họ tên hoặc mã"), q("status", "active (mặc định) | locked | all", { type: "string", enum: ["active", "locked", "all"] }), ...PAGING], list(StudentDto), NOT_FOUND),
      "/api/v1/students": op("Danh sách học sinh", "students:read", "Học sinh đang học trong năm học được chọn, kèm lớp và khối. Mặc định chỉ học sinh còn hoạt động. Dữ liệu liên hệ cần `students:contact`, định danh (CCCD…) cần `students:identity`.", [YEAR, q("grade", "Lọc theo mã khối"), q("class", "Lọc theo mã lớp"), q("q", "Tìm theo họ tên hoặc mã học sinh"), q("status", "active (mặc định) | locked | all", { type: "string", enum: ["active", "locked", "all"] }), ...PAGING], list(StudentDto)),
      "/api/v1/students/{id}": op("Chi tiết một học sinh", "students:read", "Lớp được lấy theo năm học trong ?year= (mặc định hiện hành); `class` là null nếu em không học năm đó.", [idParam, YEAR], one(StudentDto), NOT_FOUND),
      "/api/v1/teachers": op("Danh sách giáo viên", "teachers:read", "Kèm môn phụ trách và lớp chủ nhiệm trong năm học được chọn. Liên hệ cần `teachers:contact`.", [YEAR, q("q", "Tìm theo họ tên hoặc mã"), q("subject", "Lọc theo mã môn học"), q("homeroom", "true | false: có/không chủ nhiệm", { type: "string", enum: ["true", "false"] }), q("status", "active (mặc định) | locked | all", { type: "string", enum: ["active", "locked", "all"] }), ...PAGING], list(TeacherDto)),
      "/api/v1/teachers/{id}": op("Chi tiết một giáo viên", "teachers:read", "", [idParam, YEAR], one(TeacherDto), NOT_FOUND),
      "/api/health": { get: { tags: ["Ops"], summary: "Liveness (không đụng DB)", responses: { "200": { description: "OK" } } } },
      "/api/ready": { get: { tags: ["Ops"], summary: "Readiness: DB, migration, kho tệp", responses: { "200": { description: "Sẵn sàng" }, "503": { description: "Có thành phần lỗi" } } } },
      "/api/jobs/run": { get: { tags: ["Ops"], summary: "Chạy worker hàng đợi (cron)", security: [{ cronBearer: [] }], parameters: [{ name: "cleanup", in: "query", schema: { type: "string", enum: ["1"] } }], responses: { "200": { description: "Số việc đã xử lý", content: out(z.object({ processed: z.number(), remaining: z.boolean() })) }, "401": err("Sai CRON_SECRET") } } },
    },
  };
}

const body = (schema: z.ZodType) => ({ required: true, content: { "application/json": { schema: z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) } } });
const IDEM = { name: "Idempotency-Key", in: "header", required: true, description: "Chuỗi duy nhất cho mỗi lần tạo (8–100 ký tự). Gửi lại cùng khoá và cùng nội dung sẽ trả đúng kết quả lần đầu, không tạo trùng.", schema: { type: "string", minLength: 8, maxLength: 100 } };
const WRITE_ERR = { "400": pub("Dữ liệu không hợp lệ"), "401": pub("Khoá sai/hết hạn/thu hồi"), "403": pub("Chưa được cấp quyền ghi (hoặc quyền nhạy cảm cho trường đã gửi)"), "404": pub("Không tìm thấy"), "409": pub("Vi phạm quy tắc nghiệp vụ (trùng, sĩ số, kết quả đã duyệt…) hoặc đang xử lý"), "415": pub("Thiếu Content-Type: application/json"), "422": pub("Idempotency-Key đã dùng cho nội dung khác"), "429": pub("Vượt giới hạn tốc độ ghi") };
const wop = (summary: string, scope: string, description: string, parameters: object[], reqBody: object, ok: object, status = "200") => ({
  tags: ["API ngoài (v1)"], summary, description: `${description}\n\nQuyền cần có: \`${scope}\`. Mọi thay đổi được ghi nhật ký và quản trị hoàn tác được.`, security: [{ apiKeyBearer: [] }], parameters, requestBody: reqBody,
  responses: { [status]: { description: status === "201" ? "Đã tạo" : "OK", content: ok }, ...WRITE_ERR },
});
const YouthDto = z.object({ studentId: z.string(), isMember: z.boolean(), joinedAt: z.string().nullable(), branch: z.string().nullable(), position: z.string().nullable(), note: z.string().nullable(), updatedAt: z.string().nullable() });
const Room = z.object({ id: z.string(), name: z.string(), capacity: z.number() });
const Subject = z.object({ id: z.string(), name: z.string(), assessmentType: z.string() });

/** Tài liệu OpenAPI đầy đủ: phần đọc + phần ghi (tạo/sửa, chống gửi trùng, quyền theo từng nhóm trường). */
export function buildOpenApi() {
  const doc = baseSpec();
  const paths = doc.paths as Record<string, Record<string, unknown>>;
  const id = [idParam];
  Object.assign(paths["/api/v1/students"], { post: wop("Tạo học sinh", "students:write", "Tạo học sinh kèm tài khoản đăng nhập (mật khẩu ngẫu nhiên, bắt đổi lần đầu; không trả về). Nếu gửi classId, học sinh được xếp vào lớp theo quy tắc của nhà trường; lỗi thì học sinh vừa tạo bị huỷ. Gửi contact/guardian cần thêm `students:contact`, identity cần thêm `students:identity`.", [IDEM], body(studentCreate), one(StudentDto), "201") });
  Object.assign(paths["/api/v1/students/{id}"], { patch: wop("Cập nhật học sinh", "students:write", "Chỉ các trường gửi lên được đổi; null xoá giá trị. Trường nhạy cảm cần quyền tương ứng. Không đổi lớp ở đây (dùng PUT /students/{id}/class).", id, body(studentPatch), one(StudentDto)) });
  paths["/api/v1/students/{id}/class"] = { put: wop("Xếp hoặc chuyển lớp", "students:write", "Dùng đúng quy tắc chuyển lớp của nhà trường: bắt buộc lý do và số quyết định/căn cứ, ngày hiệu lực trong năm học, kiểm tra sĩ số và kết quả cuối năm đã duyệt; lịch sử chuyển lớp được ghi lại.", id, body(studentClass), one(StudentDto)) };
  paths["/api/v1/students/{id}/youth"] = {
    get: op("Thông tin Đoàn của một học sinh", "youth:read", "Chỉ thông tin Đoàn (không trả hồ sơ học sinh).", id, one(YouthDto), NOT_FOUND).get,
    patch: wop("Cập nhật thông tin Đoàn", "youth:write", "Trạng thái đoàn viên, ngày kết nạp, chi đoàn, chức vụ. Chỉ trả thông tin Đoàn.", id, body(youthPatch), one(YouthDto)),
  };
  paths["/api/v1/youth"] = op("Danh sách thông tin Đoàn", "youth:read", "Các học sinh đã có dữ liệu Đoàn (mã học sinh + thông tin Đoàn).", PAGING, list(YouthDto));
  Object.assign(paths["/api/v1/teachers"], { post: wop("Tạo giáo viên", "teachers:write", "Tạo hồ sơ giáo viên kèm tài khoản đăng nhập (vai trò giáo viên bộ môn; mật khẩu ngẫu nhiên, không trả về, quản trị cấp lại ở mục Tài khoản). contact cần thêm `teachers:contact`.", [IDEM], body(teacherCreate), one(TeacherDto), "201") });
  Object.assign(paths["/api/v1/teachers/{id}"], { patch: wop("Cập nhật giáo viên", "teachers:write", "Chỉ các trường gửi lên được đổi; subjectIds thay thế toàn bộ danh sách môn.", id, body(teacherPatch), one(TeacherDto)) });
  Object.assign(paths["/api/v1/classes"], { post: wop("Tạo lớp", "classes:write", "Cùng quy tắc như tạo lớp trên giao diện: cần phòng học cố định, tên lớp không trùng trong năm học, một phòng không có hai lớp cùng ca, ít nhất một môn học.", [IDEM], body(classCreate), one(ClassDto), "201") });
  Object.assign(paths["/api/v1/classes/{id}"], { patch: wop("Cập nhật lớp", "classes:write", "Đổi tên, phòng, ca học, giáo viên chủ nhiệm (null để bỏ).", id, body(classPatch), one(ClassDto)) });
  paths["/api/v1/rooms"] = op("Danh sách phòng học", "catalog:read", "Cần mã phòng để tạo lớp.", [], one(z.array(Room)));
  paths["/api/v1/subjects"] = op("Danh sách môn học", "catalog:read", "Cần mã môn để tạo lớp hoặc gán môn cho giáo viên.", [], one(z.array(Subject)));
  return doc;
}
