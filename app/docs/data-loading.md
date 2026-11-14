# Phạm vi dữ liệu khi tải trang

Đợt rà soát bao phủ 62 `page.tsx` trong ứng dụng, các repository đọc dữ liệu và hàm tải dùng chung. Giữ bộ lọc, thống kê, phân quyền và chức năng nhập/sửa hiện có.

## Quy tắc

- Danh sách lớn: lọc, sắp xếp và phân trang trong PostgreSQL; số đếm tính trên toàn bộ tập kết quả trước khi phân trang.
- Thẻ, bảng và ô chọn: chọn các trường được dùng; nội dung dài, đáp án và dữ liệu nội bộ tài khoản được lấy ở màn hình tương ứng.
- Trang nhiều tab: chỉ truy vấn bảng dữ liệu của tab đang mở; nhãn tab sử dụng truy vấn đếm.
- Truy vấn theo trang giữ cùng phạm vi phân quyền với truy vấn đếm. Quyền xem học sinh của giáo viên được kiểm tra qua quan hệ lớp, kể cả lịch sử xếp lớp, độc lập với dữ liệu đang hiển thị.
- Danh mục nhỏ phục vụ chọn giá trị và ma trận điểm/thời khóa biểu cần đầy đủ dữ liệu cho phần đang hiển thị; không cắt tùy tiện gây thiếu lựa chọn hoặc sai kết quả tổng hợp.
- `currentYear`/`currentTerm` dùng React `cache` để gộp yêu cầu trùng nhau trong một lần render, vẫn đọc dữ liệu mới ở yêu cầu kế tiếp.

## Các nhóm trang

| Nhóm | Phạm vi đọc |
| --- | --- |
| Học sinh | SQL tính trạng thái, tìm kiếm và phân trang; trả trực tiếp hồ sơ rút gọn và điểm trung bình của trang hiện tại, không đọc lại từng hồ sơ. Chi tiết tải lịch sử xếp lớp ở tab Lớp. |
| Giáo viên | Chỉ thông tin hiển thị trên thẻ/bảng, tên môn, các lớp phân biệt và số đếm; danh mục môn để sửa chỉ tải ở tab Thông tin. |
| Lớp học, phòng học, môn học | Danh sách phân trang; quan hệ giáo viên rút gọn. Điểm của lớp chỉ lấy cho học sinh trên trang. Dữ liệu phân công và lịch của trang chi tiết tải theo tab. |
| Nhập điểm | Phân trang phân công trước khi đọc điểm và học sinh; số đếm dùng cùng điều kiện. Tab Thống kê giữ dữ liệu cần để tổng hợp chính xác. |
| Lớp chủ nhiệm, lớp của tôi | Roster và điểm chỉ tải cho các tab dùng chúng; sĩ số dùng count. Bảng điểm và lịch tuần lấy đủ dữ liệu cho bảng đang hiển thị. |
| Bài học, Giảng dạy | Danh sách bài đã đăng phân trang, không lấy toàn văn; xem trước giới hạn 160 ký tự tại DB. Tổng quan học sinh dùng aggregate thay danh sách bài nộp. Chi tiết chỉ đọc danh sách người xem/bài nộp của phần đang mở; học sinh chỉ đọc bài nộp của mình. |
| Ngân hàng câu hỏi/bài học, nhập AI | Danh sách câu hỏi bỏ đáp án và giải thích; chi tiết vẫn đầy đủ. Kho bài học tìm kiếm/phân trang tại DB; hộp chọn đăng bài chỉ lấy tiêu đề, thứ tự và thông tin bài tập. Lịch sử nhập bỏ nội dung tệp và payload AI. |
| Lịch học, sổ đầu bài | Hàm tải lịch dùng giáo viên rút gọn; danh mục giáo viên bỏ thông tin cá nhân. Danh sách lớp của sổ đầu bài phân trang DB; tab lịch sử chỉ lấy trang nhật ký đang xem. |
| Lịch thi | Thẻ lấy thông tin kỳ thi/môn, số phòng, chỗ thi của chính học sinh hoặc ca coi thi của chính giáo viên; danh sách đầy đủ dành cho trang chi tiết. |
| Thư viện | Các tab danh sách đã phân trang; hồ sơ người mượn chỉ lấy trường phục vụ hiển thị. |
| Tài khoản, nhân sự, vận hành | Danh sách tài khoản bỏ dữ liệu xác thực nội bộ không dùng; nhân sự lấy thông tin phân quyền hiển thị. Tác vụ nền chỉ lấy trạng thái/tiến độ, không tải JSON đầu vào/kết quả. |
| Cổng phụ huynh | Danh sách con chỉ có thông tin chọn. Hồ sơ chi tiết giới hạn ở con được chọn và dữ liệu tab/kỳ/năm đang mở. Đổi con/tab/kỳ bằng URL để server đọc đúng phạm vi. Điểm bị khóa được loại trước khi gửi về trình duyệt. Cảnh báo vắng gần đây dùng cửa sổ 7 ngày. |
| Cấu hình, lên lớp, thi đua, nhật ký, thùng rác, API và đăng nhập | Giữ các truy vấn đã tách theo tab, phân trang/giới hạn hoặc chỉ lấy trường cần dùng. Bảng tổng hợp cần dữ liệu của kỳ/lớp đang được tính; biểu mẫu cần giá trị hiện tại để không làm mất dữ liệu khi lưu. |

## Kiểm chứng

- `tests/list-loading.test.ts`: tham số SQL an toàn, thứ tự ổn định, phạm vi count/page và dữ liệu lịch thi theo vai trò.
- `tests/list-loading.integration.test.ts`: fixture PostgreSQL trong transaction tự rollback; kiểm tra trạng thái, ngưỡng điểm trước khi làm tròn, số đếm, lọc lớp/khối, tìm kiếm ký tự đặc biệt và các trang không trùng nhau.
