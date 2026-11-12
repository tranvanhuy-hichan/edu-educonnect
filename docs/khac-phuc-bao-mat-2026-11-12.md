# Khắc phục bảo mật và toàn vẹn dữ liệu

## Thay đổi

- Chốt QuizAttempt bằng update có điều kiện submittedAt=null và khóa hàng Student trong transaction. Hai yêu cầu cùng lượt chỉ một yêu cầu được ghi; yêu cầu còn lại nhận lỗi, không đổi điểm/đáp án.
- Mỗi lượt mới giữ snapshot đề, đáp án đã chọn và kết quả chấm riêng. Lịch sử trả cho học sinh không chứa snapshot đáp án đúng. Migration chỉ khôi phục được bài làm cũ còn tồn tại, không tái tạo được đáp án đã bị ghi đè trước đây.
- Cho làm lại cấp thêm một lượt trên bài nộp hiện hữu, giữ điểm đang tính, lịch sử và vi phạm. Giao diện cho phép vào lượt bổ sung kể cả bài vốn chỉ cho làm một lần. Chặn xóa bài học/bài tập đã có lượt làm ở repository; đây chưa phải hệ thống lưu trữ bất biến chống mọi thao tác quản trị/database.
- Bài thi nghiêm túc bắt buộc có lượt bắt đầu ở server dù không giới hạn giờ. Khi vi phạm đã ghi nhận chạm ngưỡng, server chốt lượt ngay với đáp án gửi kèm báo vi phạm; nếu client không gửi đáp án, phần chưa gửi được tính như chưa làm. Trình duyệt vẫn không thể chứng minh học sinh không dùng thiết bị khác hoặc không sửa client để ngừng báo sự kiện.
- Chuyển năm kiểm tra thứ tự danh mục khối: ở lại giữ khối, lên lớp sang khối kế; cuối cấp cần luồng tốt nghiệp, không cho chuyển nhầm lớp.
- Cổng phụ huynh chỉ lấy ghế thi của sự kiện PUBLISHED.
- JWT gắn dấu xác thực HMAC của passwordHash; đổi/reset mật khẩu tự vô hiệu phiên cũ, gồm cả phụ huynh. Toàn bộ phiên cũ không có dấu này cần đăng nhập lại sau triển khai. API withAuth đối chiếu lại tài khoản/quyền trong database.
- Giới hạn đăng nhập dùng PostgreSQL chia sẻ giữa các instance: 10 lần/15 phút theo thông tin đăng nhập và định danh tài khoản đã tìm thấy; không đặt lại bộ đếm khi đăng nhập thành công. Dọn bộ đếm hết hạn theo xác suất. Lỗi đăng nhập phụ huynh không phân biệt không tồn tại/sai mật khẩu. Chưa bổ sung WAF/rate limit theo IP cho lưu lượng rải trên nhiều định danh.
- Đọc body nhập tài liệu bằng giới hạn byte thực trước multipart parse; kiểm quyền giáo viên trước đọc body. DOCX giới hạn 1.000 entry, 8 MiB mỗi entry được đọc, 32 MiB tổng giải nén được đọc; chặn DTD/entity và XML quá sâu/nhiều tag.

## Migration và lưu ý triển khai

Migration mới: `app/prisma/migrations/20261113000000_security_integrity/migration.sql` (snapshot, extraAttempts, LoginThrottle).

Không áp dụng vào database thật trong lần sửa này. Cần backup, kiểm tra baseline/schema thực tế rồi áp dụng migration trước khi phát hành code; đăng nhập phụ thuộc bảng LoginThrottle mới. Không tự chạy migrate reset/db push trên production.

Thử dựng database trống bằng toàn bộ migration hiện có thất bại ở migration cũ `20261112200000_quiz_attempts`: thiếu `AssignmentSubmission.isLate`. Diff còn cho thấy các cấu trúc cũ khác chưa được ghi đầy đủ trong chuỗi migration. Không sửa checksum migration đã phát hành hoặc tự đánh dấu applied để bỏ qua. Cần đợt đối chiếu/baseline riêng theo `docs/trien-khai.md` trước khi triển khai từ đầu.

Đã kiểm chứng migration mới bằng PostgreSQL tạm: khởi tạo schema hiện tại bằng db push chỉ trên database tạm, bỏ riêng ba thay đổi mới rồi chạy SQL migration mới với ON_ERROR_STOP; Prisma diff sau đó không có khác biệt.

## Kiểm tra

- 29/29 test đạt, không skip, gồm integration PostgreSQL tách biệt cho nộp đồng thời, giữ lịch sử/cấp thêm lượt, tự chốt vi phạm, limiter chia sẻ, quyền hiện hành và thu hồi phiên khi đổi mật khẩu; cùng kiểm thử giới hạn body/DOCX và chuyển khối.
- TypeScript đạt; production build đạt; ESLint các file thay đổi đạt. Lint toàn repository còn lỗi có sẵn ở `scripts/generate-icons.js` và `components/layout/mode-toggle.tsx`.
- Không sửa `.env`, không ghi database thật. Không commit/push trong lần xử lý này.

## Ngoài phạm vi yêu cầu lần này

Cơ chế phụ huynh tự kích hoạt bằng mật khẩu chung và liên kết học sinh qua chuỗi số điện thoại (F01/F02 trong báo cáo rà soát) chưa được thay thế. Đây vẫn là rủi ro nghiêm trọng; thêm limiter không khắc phục việc biết mã học sinh và mật khẩu mặc định có thể kích hoạt tài khoản. Chưa có UI xem toàn bộ snapshot lịch sử từng lượt; dữ liệu đã được giữ để xây luồng đối soát. Chưa sửa race giữa nộp lại tự luận và chấm điểm, cũng chưa nâng cấp các dependency có advisory.
