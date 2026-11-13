# Kiểm tra đồng bộ và khả năng chạy — 13/11/2026

## Kết luận

Database cấu hình trong hai tệp `.env` đang đồng bộ dữ liệu dùng chung. Chưa có đủ bằng chứng để khẳng định mọi chức năng hoặc bản triển khai production đều hoạt động tốt.

## Bằng chứng

- Hai cấu hình kết nối cùng database; công tắc đồng bộ bật, đủ 9 trigger bật; nhật ký SyncIssue có 0 lỗi sau kiểm thử.
- 985 đoàn viên, 985 học sinh, 985 liên kết. Không lệch mã, họ tên, ngày sinh/giới tính có dữ liệu bên Đoàn, hoặc tài khoản liên kết.
- 24 chi đoàn hiện hành khớp lớp; 985 xếp lớp khớp chi đoàn. Không lệch department của Class phụ hoặc năm học của enrollment.
- Năm học khớp ngày bắt đầu/kết thúc. Không có tài khoản ADMIN/DEPARTMENT_ACCOUNT liên kết sang EduConnect.
- Không có khóa ngoại chưa validate. Checksum 5 migration đã áp dụng khớp file local; schema sinh và bản vendor khớp nguồn Cổng Đoàn.
- 9/9 test shared-data-sync.integration.test.ts đạt trên database thật: hai chiều năm học/lớp/hồ sơ/chuyển lớp, cách ly admin, tắt đồng bộ, ghi lỗi không phá thao tác Cổng Đoàn, đối soát chuyển năm học. Các giao dịch thử rollback; không chạy seed/reset/migration/backfill.
- Test thường EduConnect: 168 ca được phát hiện, 123 đạt, 0 lỗi, 45 bỏ qua. Trong số ca bỏ qua, 9 ca đồng bộ được chạy riêng như trên; các ca tích hợp còn lại chưa kiểm chứng trong lượt này.
- Typecheck cả hai dự án đạt. Build production cả hai đạt.
- Chạy hai bản build local: trang login hai bên và trang chủ Cổng Đoàn HTTP 200; health EduConnect HTTP 200. Trang quản trị chưa đăng nhập chuyển về login. Cron không có thông tin xác thực trả HTTP 401.

## Phát hiện cần xử lý

1. Hàm `edu.sync_reconcile()` chỉ thấy được gọi trong test, chưa thấy lời gọi từ ứng dụng/cron của hai repository. Database không có bảng `cron.job`. Hàm này xử lý tình huống lớp năm sau thành lớp hiện hành mà không có thao tác ghi kích hoạt trigger. Cần nối vào tác vụ định kỳ và xác minh lịch production; không loại trừ có bộ lập lịch ngoài chưa được cung cấp.
2. Build EduConnect cảnh báo `node:crypto` trong `app/src/lib/observability/report-error.ts` đi vào Edge instrumentation. Build vẫn thành công nhưng nhánh báo lỗi Edge cần được tách khỏi phụ thuộc Node và kiểm thử riêng.

## Giới hạn

Không kiểm tra phiên đăng nhập thật qua trình duyệt, toàn bộ nghiệp vụ điểm/thi/điểm danh, gửi SMS/push/email, tải tệp và dịch vụ ngoài. Không chạy toàn bộ test database vì một số test có lệnh xóa dữ liệu toàn bảng (ví dụ LoginThrottle) hoặc ghi ngoài transaction. Không xác minh biến môi trường, lịch cron hoặc URL của các bản triển khai trực tuyến. Xóa không tự lan truyền giữa hai hệ thống theo thiết kế.
