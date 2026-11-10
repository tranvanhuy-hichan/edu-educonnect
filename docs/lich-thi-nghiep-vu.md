# Nghiệp vụ lịch thi nội bộ THPT

## Phạm vi và cơ sở

Mô-đun quản lý việc tổ chức kiểm tra/thi tại trường: giữa kỳ, cuối kỳ, thi lại và đợt khác. Kỳ thi gồm một học kỳ, một khối và nhiều môn; mỗi môn có cách chia, thời gian và phân công riêng. Đây là luồng vận hành của nhà trường, không phải phần mềm đăng ký hay tổ chức kỳ thi tốt nghiệp quốc gia.

Văn bản tham khảo về đánh giá học sinh THCS/THPT: [Thông tư 22/2021/TT-BGDĐT – Cổng thông tin Chính phủ](https://vanban.chinhphu.vn/?pageid=27160&docid=203926). Thời lượng làm bài được người quản lý cấu hình cho từng môn; ứng dụng không suy diễn rằng một giá trị mặc định là yêu cầu bắt buộc cho mọi môn. Số giám thị tối thiểu để công bố trong ứng dụng là một; có thể phân hai giám thị trong giao diện. Nhà trường quyết định cách phân công phù hợp kế hoạch của mình.

## Vai trò

| Người dùng | Quyền |
| --- | --- |
| Quản trị, Hiệu trưởng, Hiệu phó | Tạo, chia phòng, xem thí sinh, sửa bản nháp, công bố, thu hồi, hủy, in và xuất Excel |
| Giáo viên chủ nhiệm/bộ môn | Xem mọi lịch đã công bố, các lịch đã công bố rồi bị hủy; xem danh sách phòng và xuất Excel; lọc lịch mình coi thi |
| Học sinh | Chỉ xem môn, phòng, SBD, chỗ ngồi và giờ có mặt của bản thân trong lịch công khai; tải lịch cá nhân ICS |
| Tài khoản khác | Không truy cập mô-đun |

Giới hạn được áp dụng tại truy vấn và server action. Đường dẫn trực tiếp hay tải file không cho phép học sinh lấy danh sách của phòng hoặc kỳ thi không có tên mình. Lịch nháp không hiển thị cho giáo viên/học sinh.

## Quy trình

1. Nhập tên, loại kỳ thi, học kỳ, khối, thông báo chung.
2. Thêm một hoặc nhiều môn, chọn thi theo lớp hoặc chia alphabet cho từng môn.
3. Chia và kiểm tra danh sách. Có thể bỏ chọn thí sinh không dự thi (ví dụ thi lại), rồi chia lại. Loại kỳ thi “Thi lại” không tự kết luận học sinh nào phải thi lại từ điểm số.
4. Gán phòng học vật lý cho từng nhóm thi, ngày/giờ, thời lượng làm bài, số phút có mặt trước giờ thi và giám thị.
5. Lưu nháp. Nháp cho phép để trống phòng hoặc giám thị, nhưng mọi môn phải có thời gian hợp lệ. Nháp đã giữ chỗ tài nguyên được gán và thời gian của các thí sinh; hủy nháp để giải phóng.
6. Công bố sau khi kiểm tra đủ phòng, sức chứa và ít nhất một giám thị mỗi phòng. Học sinh thấy lịch cá nhân; giáo viên thấy toàn bộ.
7. Trước khi kỳ thi bắt đầu, có thể thu hồi về nháp để chỉnh sửa/chia lại. Khi có môn đã bắt đầu, không cho thu hồi để thay danh sách.
8. Hủy lịch giữ lại dữ liệu, giải phóng tài nguyên. Lịch từng công bố vẫn hiện trạng thái hủy cho người liên quan. Lịch nháp bị hủy chưa từng công bố vẫn không công khai.

## Danh sách và cách chia

- Chỉ lấy học sinh có tài khoản đang hoạt động, có ghi danh trong năm học của học kỳ, thuộc khối đã chọn và lớp đã chọn môn tương ứng trong danh sách môn học. Môn tự chọn không tự gom học sinh của lớp không học môn đó.
- Thi theo lớp: mỗi lớp một nhóm, gợi ý phòng cố định của lớp. Nếu phòng không đủ sức chứa, chọn phòng lớn hơn hoặc dùng cách chia alphabet. Phòng thi có thể khác phòng học thường xuyên.
- Alphabet: sắp theo tên gọi (từ cuối), tên đệm, họ bằng bộ so sánh tiếng Việt; trường hợp trùng dùng mã học sinh rồi ID để ổn định. Không thay đổi danh sách gốc.
- Khi nhập tối đa `M` học sinh/phòng: số phòng là `ceil(N/M)`. Khi chỉ nhập số phòng `K`: chia đều `floor(N/K)` hoặc `ceil(N/K)` người/phòng. Các nhóm giữ các đoạn alphabet liên tục, không tạo phòng rỗng, không lặp hoặc mất thí sinh.
- SBD được đánh trong hợp các học sinh dự thi của cả kỳ thi, thống nhất giữa các môn; số chỗ được đánh lại từ 1 trong mỗi phòng. SBD chỉ cần duy nhất trong một môn/kỳ thi, không phải mã học sinh.
- Bản xem trước có dấu vân tay của danh sách và cách chia. Nếu dữ liệu học sinh thay đổi trước khi lưu, phải xem trước lại. Khi lưu, họ tên/mã/lớp/SBD được chụp lại trong danh sách thi để việc đổi tên hoặc chuyển lớp sau đó không âm thầm sửa hồ sơ lịch sử.
- Khi sửa nháp và chia lại, dùng dữ liệu học sinh hiện tại; các học sinh đã bỏ chọn được giữ trong cấu hình môn.

## Ràng buộc lịch và tài nguyên

- Dùng giờ Việt Nam UTC+7, không phụ thuộc múi giờ máy chủ. Kiểm tra ngày thực (không nhận 30/2), thời lượng dương, giờ thi ở tương lai và nằm trong học kỳ.
- Mỗi môn trong kỳ thi xuất hiện một lần. Nhóm thi phải khớp kết quả chia tại server; không tin danh sách học sinh hay số lượng từ trình duyệt.
- Phòng đã gán phải tồn tại và đủ sức chứa; giám thị phải có hồ sơ và tài khoản hoạt động, không lặp trong phòng.
- Không trùng phòng vật lý, giám thị hoặc thí sinh giữa các môn/phòng đang nháp hoặc công bố, kể cả giữa các kỳ thi/khối khác nhau.
- Khoảng chiếm dụng là từ giờ có mặt (`bắt đầu - số phút báo trước`) đến hết giờ làm bài. Hai khoảng tiếp giáp không trùng nhau. Khóa giao dịch dùng chung để tránh hai người đồng thời vượt qua bước kiểm tra rồi tạo lịch xung đột.
- Kiểm tra lại tài nguyên khi công bố. Lịch bị hủy không còn giữ chỗ.
- Việc thay thế các buổi học thường lệ trong thời gian thi do nhà trường quyết định. Mô-đun kiểm tra xung đột giữa các lịch thi và không tự hủy/sửa thời khóa biểu học.
- Không xóa học sinh/giáo viên/phòng/môn có hồ sơ thi; bảo toàn lịch sử. Không giảm sức chứa phòng xuống dưới số thí sinh đã xếp trong các lịch chưa kết thúc và chưa hủy.

## Đầu ra

- Lịch thi toàn trường theo kỳ thi/môn, có bộ lọc khối, môn và lịch coi thi của giáo viên.
- Phiếu cá nhân cho học sinh: môn, phòng học, số báo danh, chỗ, giờ có mặt, giờ bắt đầu/kết thúc và thông báo.
- Excel: tổng hợp ca thi, phân công giám thị, từng phòng với danh sách học sinh và cột ký tên/ghi chú. Có thể in từ trang chi tiết.
- Lịch cá nhân ICS: chỉ dữ liệu của học sinh hiện tại; UID ổn định theo kỳ thi/môn/học sinh và phiên bản thay đổi để cập nhật hoặc hủy sự kiện khi tải lại.
- Nhật ký thao tác tạo, sửa, công bố, thu hồi và hủy.

## Các nghiệp vụ tách khỏi việc lập lịch

Không tự nhập điểm, chấm bài, quyết định điều kiện thi lại, xử lý miễn thi hoặc kết luận vi phạm. Việc xác định thí sinh đặc biệt được thể hiện bằng danh sách dự thi do người quản lý rà soát; cột ký tên/ghi chú phục vụ danh sách phòng, không tự tạo kết quả điểm hay biên bản kỷ luật.

## Kiểm chứng

`tests/exam-planning.test.ts`: chia phòng, alphabet tiếng Việt, SBD giữa các môn, ngày giờ và xung đột.

`tests/exams.integration.test.ts`: dữ liệu thử thực trong PostgreSQL với rollback; kiểm tra quyền, hồ sơ lớp/môn, xem cá nhân, nhiều môn, nháp/công bố/thu hồi/hủy, dấu vân tay danh sách, ảnh chụp tên/lớp, loại trừ thí sinh, sức chứa/giám thị và xung đột tài nguyên.

## Cải tiến thao tác và hỗ trợ tự động

Giao diện chia thành ba bước: chọn khối/môn; chọn giờ và phân phòng; kiểm tra và lưu. Chỉ hiện các môn đã có trong danh sách môn của lớp và có học sinh trong phạm vi chọn. Có thể điền nhanh các môn liên tiếp trong một ngày. Các lựa chọn phòng/giám thị bị trùng ca ngay trong bản đang soạn bị vô hiệu hóa; bước kiểm tra tiếp tục hỏi server để đối chiếu với lịch khác. Lưu và công bố đều kiểm tra lại trong giao dịch có khóa.

Nút gợi ý giữ nguyên giờ thi do quản lý chọn, chọn phòng trống đủ chỗ (ưu tiên phòng lớp khi thi theo lớp), chọn giám thị trống và ưu tiên người có ít lượt được phân công hơn. Hỗ trợ gợi ý 1 hoặc 2 giám thị/phòng. Gợi ý không tự lưu hoặc công bố; người quản lý có thể sửa rồi kiểm tra lại. Việc không tìm được gợi ý không phải bằng chứng không có phương án tối ưu khác.

Nên triển khai xếp lịch tự động hoàn chỉnh theo hướng gợi ý có duyệt: quản lý cung cấp ngày thi, ca được phép, môn, thời lượng, thời gian nghỉ, phòng và giám thị; bộ giải phải thỏa các ràng buộc cứng, sau đó tối ưu số môn/ngày, phân bố thời gian nghỉ và tải coi thi. Cách biểu diễn các ràng buộc và cân bằng ca có thể tham khảo [OR-Tools CP-SAT: Employee Scheduling](https://developers.google.com/optimization/scheduling/employee_scheduling). Phiên bản hiện tại hỗ trợ chia thí sinh, điền giờ liên tiếp và gợi ý phòng/giám thị cho giờ đã chọn; chưa dùng bộ giải tối ưu toàn bộ lịch thi.

Nguồn môn học chính thức là ClassSubject trong thông tin lớp. Lịch thi không phụ thuộc việc đã phân công giáo viên dạy môn đó; thời khóa biểu phải phân công đủ giáo viên cho các môn đã chọn trước khi xếp.
