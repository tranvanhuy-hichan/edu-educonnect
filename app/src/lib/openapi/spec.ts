import { z } from "zod";
import { loginSchema } from "@/modules/auth/auth.schema";

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

export function buildOpenApi() {
  return {
    openapi: "3.1.0",
    info: { title: "EduConnect API", version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", description: "API nội bộ của EduConnect. Đăng nhập bằng cookie phiên (HttpOnly). Lỗi 5xx luôn kèm requestId." },
    servers: [{ url: process.env.NEXT_PUBLIC_APP_URL || "/" }],
    components: { securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "educonnect_session" }, cronBearer: { type: "http", scheme: "bearer", description: "CRON_SECRET" } } },
    tags: [{ name: "Auth" }, { name: "Files" }, { name: "Import" }, { name: "Notifications" }, { name: "Search" }, { name: "Ops" }],
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
      "/api/health": { get: { tags: ["Ops"], summary: "Liveness (không đụng DB)", responses: { "200": { description: "OK" } } } },
      "/api/ready": { get: { tags: ["Ops"], summary: "Readiness: DB, migration, kho tệp", responses: { "200": { description: "Sẵn sàng" }, "503": { description: "Có thành phần lỗi" } } } },
      "/api/jobs/run": { get: { tags: ["Ops"], summary: "Chạy worker hàng đợi (cron)", security: [{ cronBearer: [] }], parameters: [{ name: "cleanup", in: "query", schema: { type: "string", enum: ["1"] } }], responses: { "200": { description: "Số việc đã xử lý", content: out(z.object({ processed: z.number(), remaining: z.boolean() })) }, "401": err("Sai CRON_SECRET") } } },
    },
  };
}
