# Các điều chỉnh đã triển khai và phần nên làm tiếp

Ngày 10/11/2026. Tài liệu này cập nhật phần đã làm sau báo cáo rà soát, không thay thế nghiệm thu nghiệp vụ với nhà trường.

## Phần đã chỉnh trong mã

- Cổng phụ huynh: bỏ tab chuyên cần/nề nếp, sổ đầu bài và toàn bộ truy vấn dữ liệu sổ đầu bài của lớp. Không còn cộng số vắng toàn lớp vào dữ liệu từng con.
- Kết quả thi lại: server kiểm tra đúng ghi danh của năm học, GVCN phụ trách, trạng thái chờ đánh giá lại và trạng thái phê duyệt. Bản ghi đã duyệt phải được mở lại trước khi sửa. Đề xuất thi lại không còn ghi đè một điểm đơn lẻ lên ĐTB cả năm.
- Tổng kết: tính từng môn từ HK1 và HK2 theo (HK1 + HK2 × 2) / 3, làm tròn một chữ số. Kiểm tra đủ điểm TX theo số tiết cả năm và đủ GK/CK; thiếu dữ liệu không thay bằng 0. TB các môn chỉ là chỉ số tham khảo.
- Nhận xét: môn có cấu hình nhận xét hoặc điểm số; nhập Đạt/Chưa đạt, nhận xét, quyết định miễn và nội dung/căn cứ điều chỉnh theo học kỳ. Trường hợp có quyết định điều chỉnh cần quy tắc riêng sẽ bị giữ lại, không tự chốt bằng công thức thông thường. Miễn một học kỳ cũng không tự lấy điểm kỳ còn lại làm cả năm.
- Xét kết quả: bỏ mặc định Lên lớp/Tốt. Có bản nháp, chờ duyệt, đã duyệt; GVCN nhập rèn luyện và xác nhận số buổi nghỉ cả năm từ nguồn theo dõi của trường. Máy đề xuất dựa trên từng môn và dữ liệu đã xác nhận. Quản lý rà soát rồi duyệt; khi duyệt sẽ so lại dữ liệu mới nhất. Chuyển năm chỉ dùng kết quả đã duyệt.
- Chuyển lớp: cả hai điểm thao tác dùng cùng service lưu lớp cũ/lớp mới, mốc thời gian, lý do, căn cứ và người thực hiện. Mốc bắt đầu của dữ liệu cũ chưa biết được giữ NULL; không tự bịa ngày lịch sử. Điểm lớp cũ được giữ lại. Đối chiếu/chuyển tiếp điểm khi đổi tổ hợp là bước cần làm tiếp.
- Sửa điểm đã khóa: áp dụng cả với quản lý. Yêu cầu mở quyền có phạm vi người/lớp-môn, lý do, thời hạn 1–72 giờ, quản lý khác duyệt. Sửa điểm và cập nhật trung bình trong cùng giao dịch; nhật ký có trước/sau và lý do. Hồ sơ cuối năm đã duyệt cũng phải mở lại trước khi sửa dữ liệu môn.
- Học liệu: chọn tệp trực tiếp cho giáo án, bài học, bài tập và bài nộp; chọn Cloudinary/MinIO bằng env. Xem `docs/luu-tru-tep.md`.

## Giới hạn cần giữ rõ

- Chưa có điểm danh từng học sinh: số buổi nghỉ phục vụ xét kết quả hiện do GVCN xác nhận, không suy ra từ số vắng lớp. Không cung cấp dữ liệu này ở cổng phụ huynh theo yêu cầu.
- Phần đánh giá lại theo từng môn, kết quả rèn luyện hè và hồ sơ đặc thù vẫn cần hoàn thiện. Hiện action thi lại chỉ ghi nhận đề xuất; cần cập nhật kết quả môn và tổng hợp/trình lại trước khi chốt.
- Rèn luyện cả năm hiện do người phụ trách đánh giá/xác nhận; chưa có bộ hồ sơ minh chứng và suy dẫn từ hai học kỳ.
- Kế hoạch môn hiện vẫn theo lớp hành chính, chưa có lớp học phần hoặc tổ hợp riêng từng học sinh. Số tiết cả năm của môn cũ được khởi tạo từ tiết/tuần × 35, cần rà lại theo kế hoạch thực tế.
- Chưa triển khai tự động hóa cho mọi trường hợp miễn/điều chỉnh hoặc chuyển tiếp văn bản; không coi bản nâng cấp này là chứng nhận tuân thủ toàn bộ nghiệp vụ.
- Migration đã được kiểm tra trên PostgreSQL tạm, chưa áp dụng vào CSDL đang dùng. Kết quả cũ sau migration ở trạng thái nháp để tổng hợp và duyệt lại; không tự coi dữ liệu cũ là đã được phê duyệt.

## Chức năng nên thêm để hình thành quy trình quản lý THPT đầy đủ

| Ưu tiên | Nhóm chức năng | Liên kết quy trình cần đạt |
| --- | --- | --- |
| 1 | Xác minh tài khoản phụ huynh, quan hệ người giám hộ–học sinh | Kích hoạt riêng/OTP, thu hồi quyền khi thay người giám hộ; thay cho mật khẩu chung và dò SĐT |
| 1 | Điểm danh cá nhân trong nội bộ trường | Theo học sinh, ngày/buổi, phép/không phép, lý do; xác nhận và tổng hợp số buổi nghỉ không đếm trùng |
| 1 | Đánh giá lại theo môn và rèn luyện hè | Từ kết quả đã duyệt → danh sách phải đánh giá lại → lịch thi/kế hoạch rèn luyện → kết quả thay thế có lịch sử → xét lại |
| 2 | Kế hoạch giáo dục và môn lựa chọn | Theo khối/năm học, số tiết, chuyên đề; đăng ký môn và chuyển tổ hợp có kiểm tra ảnh hưởng đến điểm/TKB |
| 2 | Lịch năm học, dạy bù và dạy thay | Ngày nghỉ → tiết bị ảnh hưởng → phương án bù/thay có người duyệt → cập nhật TKB thực tế/sổ đầu bài |
| 2 | Tuyển sinh 10 và vòng đời học sinh | Tiếp nhận hồ sơ → đối soát mã định danh → xếp lớp; chuyển trường, thôi học, học lại, hoàn thành chương trình lớp 12 có hồ sơ quyết định |
| 3 | Hồ sơ đánh giá và học bạ số | GVBM chốt → GVCN tổng hợp → BGH duyệt → ký/xác nhận theo đặc tả áp dụng → báo cáo/Sở; PDF chỉ là một đầu ra |
| 3 | Tổ chuyên môn và phân công có hiệu lực | Duyệt kế hoạch/giáo án, lịch sử bàn giao giáo viên, theo dõi định mức, tránh đổi người trên hồ sơ lịch sử |
| 3 | Điều hành và chất lượng dữ liệu | Một hàng đợi việc chờ duyệt theo quyền; cảnh báo thiếu điểm, thiếu hồ sơ, sai lệch số liệu; xuất/nhập có đối soát và lịch sử |
| Sau lõi học vụ | Thiết bị, tài sản, tài chính, y tế | Mở theo nhu cầu trường; có người chịu trách nhiệm và tích hợp dữ liệu, tránh xây dàn trải cùng lúc |

Cần chốt hướng dẫn của Sở, mẫu biểu, người duyệt/ủy quyền và kế hoạch giáo dục thực tế trước khi nghiệm thu. Có thể xây dựng từng phân hệ, nhưng mã học sinh, năm học, lớp, môn, lịch và quyền truy cập phải dùng nguồn dữ liệu chung.

## Kiểm chứng

Kiểm thử mới gồm công thức, dữ liệu thiếu, ngưỡng xét, quyền theo năm/lớp, khóa điểm và giao dịch phê duyệt/chuyển lớp trên PostgreSQL tạm. Kiểm thử lưu trữ dùng SDK Cloudinary giả lập, HTTP giả lập cho MinIO và dữ liệu giả để kiểm tra quyền đọc tài liệu/bài nộp. Chưa dùng tài khoản cloud thật.

Đã sửa 7 ca lỗi của bộ tùy chọn TKB: khai báo đúng ca học trong fixture và đặt hai lớp cùng ca khi kiểm tra trùng giáo viên. Kiểu đầu vào thuật toán bắt buộc có `shift`, thêm kiểm thử không xếp lớp sang ca khác dù cả hai buổi đều mở. Toàn bộ 48/48 ca đạt trên PostgreSQL tạm, không bỏ qua ca tích hợp.
