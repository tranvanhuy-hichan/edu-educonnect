# Khóa quyền ghi của Cổng Đoàn và xóa lan truyền

Migration `20261121000000_shared_delete_and_write_guard`. Đã kiểm thử bằng `app/tests/shared-rollover.integration.test.ts` (chạy trong CI cùng các test tích hợp khác).

## 1. Hai lớp chặn quyền ghi

| Lớp | Chặn ở đâu | Điều kiện hoạt động |
|---|---|---|
| Ứng dụng | Server action và giao diện của Cổng Đoàn (`assertEduWrite`, ẩn nút) | Đồng bộ bật + bảng `edu."DoanWritePolicy"` có |
| Database | Trigger `sync_a_guard_*` trên `public."SchoolYear"`, `"Department"`, `"Member"` | Như trên **và** `edu."SyncSetting"."doanRole"` đã đặt |

Vì sao cần lớp database: hai ứng dụng dùng chung một database, nên chỉ **danh tính kết nối** (vai trò PostgreSQL) mới phân biệt được ai đang ghi mà không phụ thuộc vào mã của ứng dụng. Ai ghi trực tiếp bằng SQL hoặc công cụ khác bằng vai trò của Cổng Đoàn cũng bị chặn.

Quy tắc của trigger (chỉ áp dụng cho kết nối có `session_user = doanRole`):

| Nhóm | Bị chặn khi khóa |
|---|---|
| `years` | Mọi ghi vào `SchoolYear` |
| `classes` | Tạo / xóa chi đoàn học sinh; đổi tên hoặc khóa (`startYear`) |
| `placement` | Đổi `graduatedAt` của chi đoàn; đổi chi đoàn của đoàn viên; gọi `edu.sync_rollover()` |
| `profiles` | Sửa mã, họ tên, giới tính, ngày sinh; xóa đoàn viên; tạo đoàn viên cần cả `profiles` và `placement` |

Không bị chặn: dữ liệu riêng của Đoàn (bí thư, cờ đỏ, mô tả, kết nạp, điểm…), chi đoàn giáo viên, kết nối của EduConnect, và các hàm đồng bộ của hệ thống (chạy với `app.syncing = 1`).

## 2. Bật chặn cứng (chỉ làm khi đã chuẩn bị)

Bước này đổi tài khoản kết nối của Cổng Đoàn, nên làm có kế hoạch và sao lưu trước. Lưu ý trên Supabase: `session_user` là tên vai trò PostgreSQL (`doan_app`), còn chuỗi kết nối qua pooler có dạng `doan_app.<project-ref>`.

```sql
-- 1) Vai trò riêng cho Cổng Đoàn (đặt mật khẩu mạnh)
CREATE ROLE doan_app LOGIN PASSWORD '<mật-khẩu>';
GRANT USAGE ON SCHEMA public, edu TO doan_app;
GRANT ALL ON ALL TABLES IN SCHEMA public, edu TO doan_app;     -- trigger đồng bộ chạy theo quyền người gọi
GRANT ALL ON ALL SEQUENCES IN SCHEMA public, edu TO doan_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, edu TO doan_app;

-- 2) Đổi DATABASE_URL / DIRECT_URL của Cổng Đoàn sang vai trò doan_app, deploy, kiểm tra Cổng Đoàn vẫn chạy bình thường.

-- 3) Bật chặn cứng
UPDATE edu."SyncSetting" SET "doanRole" = 'doan_app' WHERE id = 1;
```

Tắt: `UPDATE edu."SyncSetting" SET "doanRole" = NULL WHERE id = 1;` (không cần đổi gì ở ứng dụng).

Quyền từng nhóm vẫn đặt ở EduConnect → Cấu hình → Cổng Đoàn.

## 3. Xóa lan truyền dưới dạng lưu trữ

Khóa ngoại cũ chỉ chặn một vài trường hợp, các trường hợp khác để lại bản ghi mồ côi (lớp bị xóa nhưng chi đoàn vẫn mở, chi đoàn bị xóa nhưng lớp mồ côi khiến chi đoàn bị tạo lại ở lần chuyển năm sau). Các trigger mới:

| Thao tác | Kết quả |
|---|---|
| EduConnect xóa lớp, chi đoàn không còn lớp nào | Chi đoàn được **lưu trữ** (`graduatedAt`, gỡ bí thư/cờ đỏ, khóa tài khoản chung). Còn đoàn viên đang hoạt động thì giữ chi đoàn và ghi `SyncIssue` `archive.department` |
| Cổng Đoàn xóa chi đoàn | Lớp EduConnect **trống** bị xóa theo. Lớp đã có học sinh / phân công / thời khóa biểu / sổ đầu bài thì **chặn**, báo "hãy đóng (lưu trữ) chi đoàn thay vì xóa" |
| EduConnect xóa hồ sơ học sinh | Đoàn viên liên kết chuyển sang `TRANSFERRED` (đã chuyển sinh hoạt) |

Giới hạn đã biết: đoàn viên đã lưu trữ nếu được sửa ở Cổng Đoàn thì `apply_member` có thể tạo lại hồ sơ học sinh; xóa đoàn viên có liên kết bị khóa ngoại chặn như trước.
