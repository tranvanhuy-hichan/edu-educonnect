# API ngoài của EduConnect (v1)

Dành cho **hệ thống bên ngoài** (ví dụ hệ thống Đoàn thanh niên) **đọc** dữ liệu khối, lớp, học sinh, giáo viên và, nếu được cấp quyền riêng, **ghi** thông tin Đoàn và tạo/sửa học sinh, giáo viên, lớp. **Không có thao tác xoá** qua API. Mô tả máy đọc được: `docs/openapi.json` (hoặc trang `/api/docs` của quản trị).

## 1. Dành cho quản trị: cấp khoá
1. Vào **Vận hành hệ thống → tab Kết nối API → Tạo khoá API**.
2. Đặt tên (đơn vị nhận), chọn **đúng những quyền cần thiết**, thời hạn, giới hạn tốc độ và **danh sách IP được phép** (khuyến nghị).
3. Sao chép khoá hiện ra **một lần duy nhất** và gửi cho đơn vị nhận qua kênh an toàn (không gửi qua Zalo nhóm/email công khai).
4. Khi cần: **Xoay khoá** (khoá cũ bị thu hồi ngay, khoá mới cùng cấu hình) hoặc **Thu hồi**. Cột “24 giờ qua” cho biết số lần gọi và số lỗi.

### Quyền (scope)
| Quyền | Cho phép | Nhạy cảm |
| --- | --- | --- |
| `years:read` | Năm học | |
| `grades:read` | Khối, số lớp, số học sinh | |
| `classes:read` | Lớp, GVCN, sĩ số | |
| `students:read` | Mã, họ tên, giới tính, ngày sinh, lớp, khối, trạng thái | |
| `students:contact` | + SĐT, email, địa chỉ, thông tin người giám hộ | ⚠ |
| `students:identity` | + CCCD/CMND, nơi sinh, dân tộc | ⚠ |
| `teachers:read` | Mã, họ tên, giới tính, môn phụ trách, lớp chủ nhiệm | |
| `teachers:contact` | + SĐT, email liên hệ | ⚠ |
| `catalog:read` | Danh sách môn học, phòng học | |
| `youth:read` | Thông tin Đoàn của học sinh | |
| `youth:write` | **GHI** thông tin Đoàn (đoàn viên, ngày kết nạp, chi đoàn, chức vụ) | ⚠ ghi |
| `students:write` | **GHI** học sinh: tạo (kèm tài khoản), sửa, xếp/chuyển lớp | ⚠ ghi |
| `teachers:write` | **GHI** giáo viên: tạo (kèm tài khoản), sửa, môn phụ trách | ⚠ ghi |
| `classes:write` | **GHI** lớp: tạo, đổi tên/phòng/ca/giáo viên chủ nhiệm | ⚠ ghi |

Quyền ghi tự kéo theo quyền đọc tương ứng. Ghi trường liên hệ/người giám hộ cần thêm `students:contact`, ghi CCCD/nơi sinh/dân tộc cần thêm `students:identity`, ghi liên hệ giáo viên cần thêm `teachers:contact`. Khoá `youth:write` chỉ thấy và trả về **thông tin Đoàn**, không thấy hồ sơ học sinh.

> **Dữ liệu cá nhân của trẻ vị thành niên.** Chỉ cấp quyền nhạy cảm khi đã có thoả thuận bằng văn bản với đơn vị nhận về mục đích, phạm vi, thời hạn lưu và biện pháp bảo mật (xem Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân). Nên giới hạn theo IP và đặt thời hạn khoá.

## 2. Dành cho bên nhận: cách gọi
Gửi khoá trong header (**không** đặt khoá trên URL):
```bash
curl -H "Authorization: Bearer ek_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
     "https://<tên-miền-của-trường>/api/v1/me"
```
Máy chủ phải gọi từ **backend** (không nhúng khoá vào trình duyệt/ứng dụng di động). CORS không được bật.

### Endpoint
| Phương thức và đường dẫn | Quyền | Mô tả |
| --- | --- | --- |
| `GET /api/v1/me` | (không) | Kiểm tra khoá: tên, quyền, giới hạn, hạn dùng |
| `GET /api/v1/academic-years` | `years:read` | Năm học (`current` = hiện hành) |
| `GET /api/v1/grades` | `grades:read` | Khối + số lớp + số học sinh |
| `GET /api/v1/classes` | `classes:read` | Lớp, khối, GVCN, sĩ số |
| `GET /api/v1/classes/{id}` | `classes:read` | Một lớp |
| `GET /api/v1/classes/{id}/students` | `classes:read` + `students:read` | Học sinh của lớp |
| `GET /api/v1/students` | `students:read` | Học sinh (kèm lớp, khối) |
| `GET /api/v1/students/{id}` | `students:read` | Một học sinh |
| `GET /api/v1/teachers` | `teachers:read` | Giáo viên (kèm môn, lớp chủ nhiệm) |
| `GET /api/v1/teachers/{id}` | `teachers:read` | Một giáo viên |

### Tham số thường dùng
- `year`: mã hoặc tên năm học (vd `2026-2027`); mặc định **năm học hiện hành**.
- Phân trang: `page` (từ 1), `pageSize` (mặc định 50, tối đa 200). Phản hồi có `meta: { page, pageSize, total, totalPages }`.
- Lọc học sinh: `grade` (mã khối), `class` (mã lớp), `q` (họ tên hoặc mã, không phân biệt hoa thường), `status` = `active` (mặc định) | `locked` | `all`.
- Lọc giáo viên: `q`, `subject` (mã môn), `homeroom` = `true|false`, `status`.

### Ví dụ
```bash
# Các khối của năm học hiện hành
curl -H "Authorization: Bearer $KEY" https://<trường>/api/v1/grades

# Toàn bộ học sinh khối 11, trang 1
curl -H "Authorization: Bearer $KEY" "https://<trường>/api/v1/students?grade=<mã khối>&pageSize=200&page=1"
```
```json
{
  "data": [{
    "id": "cmw…", "code": "HS00000001", "fullName": "Nguyễn Văn An", "gender": "MALE", "dateOfBirth": "2010-05-14",
    "status": "active",
    "class": { "id": "cmw…", "name": "10A1" }, "grade": { "id": "cmw…", "name": "Khối 10" },
    "academicYear": { "id": "cmw…", "name": "2026-2027" }
  }],
  "meta": { "page": 1, "pageSize": 200, "total": 33, "totalPages": 1 }
}
```
Trường liên hệ (`contact`, `guardian`) và định danh (`identity`) **chỉ xuất hiện** khi khoá được cấp quyền tương ứng.

### Đồng bộ dữ liệu
API trả toàn bộ dữ liệu theo trang (chưa có “chỉ phần thay đổi”). Cách khuyến nghị: mỗi đêm một lần, lặp `page` đến hết `totalPages`, so khớp theo `id` (không đổi) để thêm/sửa; học sinh không còn trong danh sách coi như đã chuyển/nghỉ. Đừng gọi liên tục: có giới hạn tốc độ.

### Ghi dữ liệu
| Phương thức và đường dẫn | Quyền | Mô tả |
| --- | --- | --- |
| `PATCH /api/v1/students/{id}/youth` | `youth:write` | Thông tin Đoàn: `isMember`, `joinedAt`, `branch`, `position`, `note` |
| `POST /api/v1/students` | `students:write` | Tạo học sinh (+ tài khoản), tuỳ chọn `classId` |
| `PATCH /api/v1/students/{id}` | `students:write` | Sửa họ tên, ngày sinh, giới tính, liên hệ, người giám hộ, định danh |
| `PUT /api/v1/students/{id}/class` | `students:write` | Xếp/chuyển lớp: bắt buộc `reason`, `decisionReference`, `effectiveDate` |
| `POST /api/v1/teachers`, `PATCH /api/v1/teachers/{id}` | `teachers:write` | Tạo/sửa giáo viên (`loginEmail`, `subjectIds`, `contact`) |
| `POST /api/v1/classes`, `PATCH /api/v1/classes/{id}` | `classes:write` | Tạo/sửa lớp (`name`, `gradeId`, `roomId`, `shift`, `homeroomTeacherId`, `subjectIds`) |
| `GET /api/v1/rooms`, `GET /api/v1/subjects` | `catalog:read` | Mã phòng và môn học để tạo lớp/gán môn |

Quy tắc chung của các lệnh ghi:
- Thân yêu cầu là **JSON** (`Content-Type: application/json`, tối đa 64 KB). Trường lạ, ngày sai (`YYYY-MM-DD`), SĐT/CCCD sai định dạng bị từ chối `400` và **không ghi gì**.
- **POST (tạo mới) bắt buộc header `Idempotency-Key`** (8–100 ký tự). Gửi lại cùng khoá và cùng nội dung trả đúng kết quả lần đầu (header `Idempotent-Replay: true`), không tạo trùng; cùng khoá khác nội dung trả `422`. PATCH/PUT vốn lặp lại được.
- **PATCH chỉ đổi các trường được gửi**; `null` xoá giá trị. Gửi giá trị đang có thì `meta.changed = false` và không ghi nhật ký.
- Dùng đúng **quy tắc nghiệp vụ của nhà trường**: tên lớp không trùng, một phòng không có hai lớp cùng ca, chuyển lớp cần lý do + số quyết định + trong năm học + đủ sĩ số, không sửa kết quả đã duyệt. Vi phạm trả `409 business_rule` kèm lý do.
- Tài khoản đăng nhập của học sinh/giáo viên tạo qua API có **mật khẩu ngẫu nhiên, bắt đổi lần đầu, không trả về**. Nhà trường cấp mật khẩu ở mục Tài khoản (Cấp lại MK hàng loạt).
- Giới hạn riêng cho lệnh ghi: 60 yêu cầu/phút/khoá.
- Mọi thay đổi được **ghi nhật ký** (trước/sau) và quản trị **hoàn tác** được ở tab Kết nối API; học sinh/lớp tạo nhầm vào Thùng rác.

```bash
# Cập nhật thông tin Đoàn
curl -X PATCH -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"isMember":true,"joinedAt":"2025-03-26","branch":"Chi đoàn 10A1","position":"Bí thư"}' \
  https://<trường>/api/v1/students/<mã học sinh>/youth

# Tạo học sinh vào lớp
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: dk-2026-0001" \
  -d '{"fullName":"Nguyễn Văn An","dateOfBirth":"2011-05-14","gender":"MALE","classId":"<mã lớp>"}' \
  https://<trường>/api/v1/students
```

## 3. Lỗi, giới hạn, bảo mật
Mọi lỗi cùng dạng `{ "error": { "code": "...", "message": "..." } }`.

| HTTP | `code` | Nghĩa |
| --- | --- | --- |
| 400 | `invalid_parameters` | Tham số sai (kèm `details`) |
| 400/404 | `year_not_found`, `not_found` | Không có năm học/đối tượng |
| 400 | `idempotency_key_required`, `invalid_json` | Thiếu Idempotency-Key khi tạo mới / JSON hỏng |
| 409 | `business_rule`, `email_taken`, `request_in_progress` | Vi phạm quy tắc của trường / email đã dùng / đang xử lý |
| 413, 415, 422 | `payload_too_large`, `unsupported_media_type`, `idempotency_key_reuse` | Thân quá lớn / sai kiểu nội dung / khoá dùng cho nội dung khác |
| 401 | `missing_api_key`, `invalid_api_key`, `key_revoked`, `key_expired` | Khoá thiếu/sai/thu hồi/hết hạn |
| 403 | `insufficient_scope` | Khoá chưa có quyền (kèm `required`) |
| 403 | `ip_not_allowed` | IP không nằm trong danh sách cho phép |
| 429 | `rate_limited`, `too_many_failures` | Vượt giới hạn (xem header `Retry-After`) |
| 500 | `internal_error` | Lỗi hệ thống (kèm `requestId`, báo cho nhà trường) |

- Header phản hồi: `X-Request-Id` (gửi khi báo lỗi), `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (giây).
- Giới hạn mặc định **120 yêu cầu/phút/khoá** (quản trị chỉnh 10–1000). Gửi sai khoá quá nhiều từ một IP sẽ bị chặn tạm.
- Nhà trường lưu **nhật ký gọi** (thời điểm, đường dẫn, mã trạng thái, IP che bớt) 30 ngày; không lưu nội dung phản hồi.
- Khoá chỉ được lưu dạng băm; nếu mất khoá, phải thu hồi và cấp khoá mới.
