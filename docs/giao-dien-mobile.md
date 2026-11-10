# Quy ước giao diện mobile

- Dưới 768px, dùng `content-panel` chỉ cho khung nội dung ngoài: không nền, viền, bóng hoặc padding ngang. `Card` mặc định giữ nền, viền và padding cho thẻ thống kê/mục dữ liệu; dùng `mobile="flat"` khi Card là khung bọc form. Thẻ từng lớp, môn, hồ sơ và hàng dữ liệu vẫn có nền/viền riêng. Ô nhập, cảnh báo, nút và dialog giữ bề mặt riêng.
- `AutoForm` đánh dấu `filter-form`: ô tìm kiếm dùng chung hàng với nút Bộ lọc hoặc một ô lọc đơn giản; trường mở rộng nằm dưới khi mở Bộ lọc. Riêng danh sách Giáo viên, tìm kiếm chiếm riêng một hàng đủ rộng. Các ô lọc mở rộng dùng hai cột co giãn. Các ô chọn phải có `min-width: 0`; phần bộ lọc bung ra chiếm trọn hàng.
- Toolbar thư viện tách bộ lọc và hai nút thao tác thành các hàng rõ ràng. Nút Bảng/Thẻ chiếm cả hàng trên mobile. Bộ chọn loại phòng dùng hai cột đều nhau.
- TKB mobile chỉ hiện hàng chuyển tuần và hàng chọn kiểu xem/Bộ lọc/nút ⋯; Hôm nay, tạo lịch và xuất Excel nằm trong ⋯. Desktop giữ các nút và tab hiện sẵn. Khoảng ngày không xuống dòng. Sổ đầu bài mobile chỉ hiện chọn lớp và điều hướng tuần; chọn tuần cụ thể, lọc giáo viên, về tuần này và ghi sổ nằm trong ⋯.
- Bảng responsive giữ card nhỏ riêng cho từng bản ghi, dùng nhãn trên giá trị, vùng thao tác chiếm cả hàng. Bảng có nhiều ô nhập như xét kết quả năm học dùng `mobileLayout="stack"` để từng trường có đủ chiều rộng.
- Tab giữ chiều rộng tối thiểu theo nội dung và cuộn ngang khi cần, tránh ép hoặc cắt chữ.
- Bottom bar gồm 5 mục theo quyền: quản lý có Trang chủ, Lớp học, TKB, Sổ đầu bài, Nhập điểm. Các vai trò khác chỉ nhận liên kết trong menu được phép của mình. Menu đầy đủ vẫn mở ở header. Có khoảng đệm safe area.
- Phân trang mobile có số bản ghi, dropdown số dòng và điều hướng trước/sau kèm Trang X/Y. Desktop giữ dãy số trang. Khi đổi số dòng, giữ bộ lọc và đặt đúng khóa trang về 1.

## Kiểm tra

Đã render fixture từ JSX thực tế của toolbar TKB, thư viện, bảng xét kết quả và các component dùng chung, kiểm tra bằng Chromium ở 320, 390, 768 và 1280px. Các fixture không tràn ngang; form xét kết quả xếp dọc trên mobile; khung desktop giữ nguyên. Đây là kiểm tra bố cục component với dữ liệu giả lập, không thay thế kiểm tra toàn bộ luồng nghiệp vụ trên website production.

Có 8 kiểm thử cho bottom bar theo các vai trò quản lý, giáo viên, học sinh và thủ thư, gồm trường hợp nhiều vai trò và kiểm tra liên kết nằm trong menu được phép.

Các thao tác thêm mới/nhập hàng loạt của giáo viên, học sinh, lớp học, lịch thi và thư viện nằm trong ⋯ ở tiêu đề trên mobile. Desktop vẫn có các nút hiện sẵn.

## Rà soát toolbar toàn ứng dụng

`Title` thu gọn thao tác phụ vào `ToolbarActions` trên mobile; những nơi đã tự có menu dùng `actionsInline`, điều hướng tuần dùng `mobileActions="visible"`. Không cần tự ẩn nút bằng CSS rồi bỏ luôn đường mở lại. Bộ chọn ngữ cảnh chính và các trường bắt buộc của quy trình được giữ ngoài.

Bài học, Giáo án, Thư viện, Tài khoản, Giáo viên, Học sinh, Lớp học, Phân công, Thi đua, Lớp chủ nhiệm, Nhập điểm và Sổ đầu bài đã được rà soát. Nút Bảng/Thẻ nằm trong Bộ lọc hoặc menu tùy chọn trên mobile. Thể loại Thư viện, ngày lọc Sổ đầu bài và các bộ lọc nâng cao được thu gọn. Các trường vẫn nằm trong đúng form khi đóng để không mất giá trị đã chọn.

Đã kiểm tra tương tác bằng React và Chromium với dữ liệu giả lập: mở/đóng bộ lọc, chọn thể loại, giữ giá trị khi đóng, mở menu kiểu xem, mở hộp nhập hàng loạt và đổi tuần giữ đúng lớp. Các fixture chạy ở 320, 390 và 1280px không tràn ngang, không có ngoại lệ JavaScript. Router trong fixture là giả lập để kiểm tra tham số điều hướng; chưa kiểm tra các luồng này trên production.


### Sửa card bảng bị giãn trên mobile

Các utility Tailwind như `[&>td]:!py-3` có `!important` trong layer `utilities`; chúng thắng quy tắc `padding: 0 !important` ngoài layer. Điều này khiến các thẻ từ bảng vẫn bị đệm trên/dưới ở từng ô. Reset mobile nay nằm trong cùng layer với selector cụ thể hơn, áp dụng cho các bảng responsive dùng chung.

`Table` và `ResponsiveTable` bổ sung `mobileLayout="compact"`: nhãn ngắn đặt cùng dòng giá trị, chữ căn trái, gap nhỏ. Đã áp dụng cho bảng điểm/Lớp chủ nhiệm, sổ đầu bài theo ngày, danh sách bài học dạng bảng và giáo án. Nội dung và nút hành động vẫn giữ đủ; dialog giáo án mở bằng tiêu đề căn trái, cho phép xuống dòng. Thời khóa biểu ở Lớp chủ nhiệm dùng cùng khung lưới có đường chia cột và cột tiết cố định như chi tiết lớp.

Kiểm tra browser với cấu trúc Table/row utility tương ứng và dữ liệu minh họa: ở 390px, hàng điểm 182→83px, dòng sổ đầu bài 254→103px, bài học 202→108px, giáo án 199→107px. Đây là số đo fixture, không phải cam kết chiều cao cố định cho nội dung dài. Kiểm tra 320/390/768/1280px, sáng/tối; desktop giữ padding cũ, mobile padding ô bằng 0 và không tràn ngang toàn trang.
