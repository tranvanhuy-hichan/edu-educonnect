# Định hướng giao diện EduConnect

Phạm vi: nghiên cứu dựa trên cấu trúc hiện tại của theme, trang Tổng quan, ClassCard và bộ lọc dùng chung. Bản mẫu đã được áp dụng trong mã nguồn cho Tổng quan quản lý và Danh sách lớp; chưa triển khai lên website.

## Những điểm cần sửa trong cấu trúc hiện tại

- `app/src/lib/theme.ts` đã có primary/background/surface/line nhưng chưa có màu riêng cho bề mặt tương tác và bề mặt nổi. Nhiều thành phần dùng `orange-*` được theme đổi sang màu chủ đạo: cần tách dần màu thương hiệu khỏi màu nghiệp vụ, tránh đổi cả cảnh báo sang xanh.
- Tổng quan quản lý đang dành khối lớn có nền xanh cho tiến độ sổ đầu bài; khối Cần theo dõi ít nổi bật hơn. Trên mobile, công việc cần xử lý xuất hiện sau thống kê và tiến độ.
- Số tiết chưa ghi hiện bao gồm cả tiết chưa diễn ra trong ngày. Không dùng toàn bộ số này làm cảnh báo quá hạn hoặc gán mức độ khẩn cấp.
- ClassCard dùng viền trái có màu sinh từ mã lớp; màu này không phản ánh ca học, trạng thái hoặc khối. Chữ GVCN/lớp trưởng còn bị cắt một dòng.
- MobileCollapse đã hỗ trợ số bộ lọc đang áp dụng. Có thể bổ sung tóm tắt ngắn sau khi chọn; không mở lại cả toolbar hoặc thêm nhiều chip làm tăng chiều cao.

## Nguyên tắc chung

Một màu thương hiệu xanh lá cho mọi vai trò. Màu phụ biểu đạt trạng thái, không biểu đạt quyền truy cập. Mỗi vùng chỉ một hành động chính. Giữ card nhỏ, loại bỏ khung cấu trúc thừa trên mobile; không tăng kích thước card để tạo điểm nhấn.

Dùng màu, chữ, khoảng cách và phân cấp thông tin trước khi thêm bóng hoặc trang trí. Không thêm biểu đồ nếu chưa xác định dữ liệu, nguồn và quyết định mà biểu đồ hỗ trợ.

## Bộ nền và màu đề xuất để thử nghiệm

| Vai trò | Sáng | Tối |
| --- | --- | --- |
| Nền trang | #F3F6F5 | #0C1210 |
| Card | #FFFFFF | #141E19 |
| Vùng tương tác/nền phụ | #EDF3EF | #1D2A22 |
| Viền | #DCE5DF | #304237 |
| Chữ chính | #17251D | #EDF4EF |
| Chữ phụ | #5E7065 | #A8B9AD |

Giữ primary hiện tại #30794B làm điểm xuất phát. Trong chế độ tối cần màu chữ liên kết xanh sáng riêng; màu nút và màu chữ liên kết không dùng chung một giá trị bắt buộc. Kiểm tra tương phản của từng cặp thực tế trước khi chốt, bao gồm hover/focus/disabled và cài đặt theme tùy chỉnh.

Bổ sung các biến ngữ nghĩa như surface-muted, surface-raised, text-muted, brand-soft, success, info, warning, danger cùng nền/chữ tương ứng. Menu và dialog dùng surface-raised; ô nhập có viền rõ. Light mode dùng bóng rất nhẹ cho card nổi, dark mode ưu tiên chênh lệch nền và viền.

Không thay toàn bộ orange-* bằng một màu mới: rà từng thành phần để phân biệt thương hiệu, thông tin, cảnh báo và lỗi. Giữ tương thích các theme đang lưu; không ghi đè cấu hình người dùng.

## Mẫu Tổng quan

Desktop:
1. Header ngắn: lời chào/tên hiển thị, học kỳ và năm học, ngày hiện tại. Không có banner cao.
2. Bốn thống kê nhỏ trên một hàng. Số là điểm nhấn chính, biểu tượng có nền nhẹ, không tô toàn bộ card xanh.
3. Vùng hai cột: công việc cần xử lý là vùng chính, tiến độ/ngữ cảnh trong ngày là vùng phụ.
4. Lịch trong ngày và hoạt động gần đây. Giảm sự lặp lại giữa truy cập nhanh, cảnh báo và danh sách chi tiết.

Mobile:
1. Header gọn.
2. Tóm tắt cần xử lý, tối đa ba dòng và liên kết xem thêm nếu cần.
3. Thống kê dạng lưới 2×2, card nhỏ.
4. Lịch và tiến độ; nhật ký hoạt động ở dưới.

Mỗi mục cần xử lý có tên, số lượng và liên kết đúng phạm vi dữ liệu. Chỉ thêm hồ sơ chờ duyệt/mở khóa điểm khi đã có truy vấn đúng quyền; không hiển thị số giả hoặc liên kết lọc mà trang đích chưa hỗ trợ. Chưa có việc cần xử lý thì hiển thị trạng thái bình thường, không giữ một khối cảnh báo màu cam rỗng.

## Mẫu Danh sách lớp

- Giữ tên lớp nổi bật; số học sinh là chữ/số trung tính, không cần huy hiệu xanh đậm.
- Viền và nền trung tính; bỏ màu ngẫu nhiên theo ID. Khi tương tác mới dùng viền/focus màu chủ đạo.
- Ca học dùng nhãn thông tin nhẹ; thiếu GVCN có nhãn cảnh báo bằng chữ và biểu tượng.
- Mobile ưu tiên tên lớp, sĩ số, GVCN và phòng. Thông tin ít dùng như lớp trưởng xem trong chi tiết; tránh nhiều nhãn cùng hàng.
- Tên GVCN tối đa hai dòng để vẫn nhận diện được. Giữ khoảng đệm khoảng 12px trên mobile.
- Desktop giữ bảng cho nhu cầu so sánh, tùy chọn card vẫn có trong menu. Không ép mọi người dùng sang card.
- Search và Bộ lọc cùng hàng trên mobile. Hiển thị số bộ lọc, trạng thái không có kết quả và thao tác xóa lọc dễ tìm.

## Thứ tự triển khai

1. Bổ sung token màu và quy tắc nền dùng chung; làm mẫu Tổng quan + ClassCard, chưa đổi toàn hệ thống ngay.
2. Kiểm tra cả hai mẫu ở 320/390/768/1280px, sáng/tối, nội dung dài, số liệu bằng 0 và số liệu lớn.
3. Chốt mẫu, áp dụng cho danh sách giáo viên/học sinh, môn học, thư viện; sau đó tới bảng nghiệp vụ và biểu mẫu.
4. Rà trạng thái loading, rỗng, lỗi, focus bàn phím, menu và dialog. Giữ bộ lọc thu gọn, vùng chạm nút đủ dùng và không cuộn ngang cả trang.

Điều kiện đạt: nhận ra hành động chính và thông tin quan trọng ngay; công việc cần xử lý đứng trước nội dung tham khảo trên mobile; card không cao hơn bản compact hiện tại chỉ vì trang trí; không đổi nghiệp vụ, quyền truy cập hoặc ý nghĩa cảnh báo.

## Bản mẫu đã thực hiện

- Theme bổ sung màu ngữ nghĩa cho nền phụ, nền nổi, chữ phụ, thương hiệu, thông tin, cảnh báo và lỗi; giữ cấu hình theme tùy chỉnh và ánh xạ màu cũ để tương thích các trang còn lại.
- Tổng quan có header gọn với học kỳ/năm học, thống kê nhỏ, khối cần xử lý phân biệt cảnh báo với thông tin chưa ghi sổ. Mobile ưu tiên việc cần xử lý, sau đó thống kê và tiến độ.
- Danh sách lớp có card trung tính, nền biểu tượng nhẹ, sĩ số rõ, tên GVCN tối đa hai dòng và cảnh báo thiếu GVCN; lớp trưởng vẫn hiện trên desktop và trong trang chi tiết. Bộ lọc giữ dạng thu gọn, có tóm tắt khi áp dụng và liên kết xóa lọc.
- Kiểm tra bằng JSX thực tế với dữ liệu minh họa ở 320/390/768/1280px, sáng/tối, dữ liệu bằng 0, số lớn và tên dài. Đây là kiểm tra bố cục trình duyệt với router giả lập, không phải luồng đăng nhập/DB production.
