# Rà soát nghiệp vụ EduConnect cho THPT Việt Nam

Ngày rà soát: 10/11/2026. Phạm vi: schema Prisma, service, server action, giao diện liên quan và bộ kiểm thử hiện có. Không sửa mã nghiệp vụ, không thay đổi dữ liệu. Đây là đánh giá trên mã nguồn, chưa phải nghiệm thu vận hành với nhà trường.

## Kết luận

Hệ thống có nền tảng quản lý học vụ, nhưng chưa đủ cơ sở để dùng làm nguồn kết quả học tập, rèn luyện và xét lên lớp chính thức. Khoảng trống chính nằm ở quy tắc đánh giá, vòng đời hồ sơ, quyền phê duyệt và khả năng truy nguyên dữ liệu.

Mục tiêu nên là: mỗi dữ liệu có nguồn gốc, người chịu trách nhiệm, thời gian hiệu lực, trạng thái xử lý và lịch sử; các phân hệ sử dụng lại cùng dữ liệu.

## Căn cứ và thời điểm áp dụng

- [Thông tư 22/2021/TT-BGDĐT](https://vanban.chinhphu.vn/?docid=203926&pageid=27160): nền tảng đánh giá học sinh THCS, THPT. Các công thức và điều kiện cần đối chiếu đầy đủ theo điều, khoản, không chỉ theo tên gọi của giao diện.
- [Nội dung TT22 trên CSDL văn bản Bộ GDĐT](https://vbpl.moj.gov.vn/bogiaoducdaotao/Pages/vbpq-print.aspx?ItemID=150073&dvid=317): căn cứ đối chiếu đánh giá theo môn, học kỳ, cả năm.
- [Thông tư 15/2026/TT-BGDĐT](https://vanban.chinhphu.vn/?docid=217678&pageid=27160): Điều lệ trường phổ thông, hiệu lực 10/05/2026; cần dùng bản kèm đính chính khi xây dựng danh mục hồ sơ và trách nhiệm.
- [Thông tư 89/2026/TT-BGDĐT](https://vanban.chinhphu.vn/?classid=1&docid=220070&pageid=27160&typegroupid=6&year=2026): ban hành 16/10/2026, hiệu lực 01/12/2026. Tại ngày rà soát, văn bản này CHƯA có hiệu lực. Cần chuẩn bị phiên bản quy tắc và chuyển tiếp.
- [Báo Chính phủ giới thiệu TT89](https://baochinhphu.vn/quy-dinh-moi-trong-danh-gia-hoc-sinh-tieu-hoc-thcs-va-thpt-102261020155041243.htm): có nội dung về học bạ số, kiểm tra định kỳ và đánh giá lại. Không đồng nhất xuất PDF với hoàn thành nghiệp vụ học bạ số.

Các quy tắc nội bộ như hạn sửa sổ 7 ngày, tự khóa điểm sau 15 ngày phải được ghi là chính sách trường, không mặc nhiên coi là quy định chung của Bộ. Cần đối chiếu thêm hướng dẫn năm học và mẫu biểu của Sở quản lý trường trước nghiệm thu.

## Những nền tảng nên giữ

- Có năm học, học kỳ, khối, lớp và ghi danh; khóa duy nhất tránh ghi danh trùng một học sinh/năm.
- Danh sách môn của lớp là nguồn dùng chung cho phân công và xác định đối tượng thi. `modules/curriculum/service.ts` bảo vệ việc bỏ môn đã có dữ liệu.
- TKB có phiên bản và thời gian hiệu lực; kiểm tra trùng lớp, phòng, giáo viên; bảo vệ tiết đã ghi sổ. Có khóa giao dịch khi xếp lịch.
- Lịch thi có nháp/công bố/thu hồi/hủy, kiểm tra sức chứa và xung đột tài nguyên giữa các lịch thi; lưu ảnh chụp danh sách thí sinh, kiểm soát quyền xem.
- Có cổng phụ huynh, thông báo, sổ đầu bài, thư viện, nhật ký và khóa sổ điểm cơ bản.

## Phát hiện cần sửa trước triển khai chính thức

P0: cần xử lý trước khi dùng dữ liệu học sinh thật. P1: cần hoàn thiện trước khi dùng kết quả chính thức.

### F01 — P0: Cấp tài khoản phụ huynh chưa xác minh danh tính

Bằng chứng: `app/src/app/phu-huynh/actions.ts`, `parentLogin`: tìm học sinh bằng mã/email/SĐT; khi chưa có tài khoản thì chấp nhận mật khẩu chung `123456` và tự tạo tài khoản. Tài khoản chưa có bước bắt buộc đổi mật khẩu tương đương User.

Rủi ro: biết mã học sinh có thể đủ để kích hoạt tài khoản của người giám hộ chưa đăng nhập trước đó. Đây là phát hiện trên luồng mã, chưa thử truy cập tài khoản thật.

Đề xuất: kích hoạt bằng OTP tới SĐT đã được xác minh hoặc mã mời riêng do trường cấp; hết hạn mã; hạn chế thử đăng nhập; thu hồi phiên khi đặt lại mật khẩu. Tạo quan hệ ParentStudent rõ ràng, cho phép nhiều người giám hộ và nhiều con. Không tìm quyền xem bằng contains/startsWith SĐT như `phu-huynh/page.tsx` hiện tại.

### F02 — P0: Quyền cập nhật kết quả thi lại chưa kiểm tra phạm vi học sinh

Bằng chứng: `app/src/app/(app)/len-lop/actions.ts`, `resolveReExamResult`: cho GVCN gọi action nhưng cập nhật trực tiếp YearEndResult theo studentId/năm, chưa kiểm tra phụ trách học sinh, chưa kiểm tra trạng thái đang chờ đánh giá lại.

Đề xuất: dùng service kiểm tra quyền ghi theo lớp và năm học; chặn kết quả đã duyệt/khóa; kiểm tra trạng thái hợp lệ. Kiểm thử GVCN lớp A không sửa học sinh lớp B bằng action trực tiếp.

### F03 — P1: Số liệu chuyên cần cá nhân đang dùng số vắng toàn lớp

Bằng chứng: `phu-huynh/page.tsx` lấy ClassPeriodLog của lớp, tối đa 30 dòng; `phu-huynh/portal-view.tsx` tính totalAbsent bằng tổng attendanceAbsentCount. Schema không lưu học sinh nào vắng.

Đề xuất: tạm ghi rõ đây là thống kê lớp, không kết luận “Chuyên cần tốt” của cá nhân khi chưa có dữ liệu. Bổ sung StudentAttendance theo học sinh/ngày/buổi hoặc tiết, phép/không phép, lý do và người xác nhận. Quy tắc quy đổi buổi không đếm trùng các tiết cùng buổi. Dữ liệu thiếu khác với đã điểm danh và không vắng.

### F04 — P1: Mô hình đánh giá mới có điểm số

Bằng chứng: Subject chưa có hình thức đánh giá; ScoreEntry.value và SubjectTermAverage.averageValue bắt buộc là số.

Đề xuất: phân biệt môn nhận xét và môn kết hợp điểm số; bổ sung kết quả Đạt/Chưa đạt, nhận xét, số lần đánh giá bắt buộc, chuyên đề học tập, trường hợp miễn/điều chỉnh đánh giá. Không dùng điểm 0 đại diện cho thiếu điểm hoặc không áp dụng.

### F05 — P1: Tổng kết năm chưa theo chuỗi tính điểm và đánh giá chính thức

Bằng chứng: `len-lop/page.tsx` dùng `_avg` của các SubjectTermAverage trong cả năm; đây là trung bình của các dòng học kỳ/môn, không phải kết quả tổng kết chính thức. `scoring.service.ts` làm tròn 2 chữ số và cho tính khi chưa đủ điểm. Hệ số 1/2/3 còn có thể sửa tùy ý.

Đề xuất: tách điểm tạm tính và điểm chốt. Tính cả năm theo từng môn từ HKI/HKII; lưu độ chính xác và quy tắc làm tròn đúng chế độ áp dụng. Học lực tổng thể phải theo các điều kiện đánh giá, không suy ra từ một số trung bình tất cả môn. Nếu giữ chỉ số trung bình tham khảo thì gắn nhãn rõ. Bộ quy tắc phải có phiên bản và ngày hiệu lực; không cho chỉnh hệ số chính thức tùy ý.

### F06 — P1: Rèn luyện và xét lên lớp đang quá thủ công

Bằng chứng: `len-lop/page.tsx` có CONDUCTS = Tốt/Khá/Trung bình; mặc định chọn Lên lớp và Tốt. YearEndResult chỉ có overallAverage, conductRank tự do và 3 kết quả. Chưa có hồ sơ rèn luyện theo học kỳ, căn cứ đánh giá hay trạng thái duyệt.

Đề xuất: rèn luyện có Tốt/Khá/Đạt/Chưa đạt, minh chứng và nhận xét; GVCN đề xuất, người có thẩm quyền duyệt. Khi chưa đủ dữ liệu phải là Chưa đủ điều kiện xét. Máy đề xuất kết quả kèm lý do theo kết quả từng môn, rèn luyện, ngày nghỉ và trường hợp đặc biệt; không tự phê duyệt.

### F07 — P1: Đánh giá lại đang thay một số trung bình chung

Bằng chứng: `resolveReExamResult` nhận một score và ghi đè overallAverage. Không lưu môn cần đánh giá lại, kết quả cũ/mới, lần đánh giá hoặc rèn luyện trong hè.

Đề xuất: hồ sơ đánh giá lại theo từng môn và rèn luyện hè; bảo toàn kết quả gốc, ghi căn cứ thay thế, tính lại điều kiện xét và phê duyệt. Kỳ thi lại nên lấy đối tượng từ danh sách đánh giá lại đã duyệt.

### F08 — P1: Chuyển lớp mất thời gian hiệu lực của ghi danh

Bằng chứng: StudentClassEnrollment chỉ có một dòng/học sinh/năm; `lop-hoc/actions.ts`, transferStudent đổi schoolClassId trên dòng cũ. Không có ngày vào/ra lớp. `canViewStudent` cũng không giới hạn năm học dù chú thích nói năm hiện tại.

Đề xuất: lưu các giai đoạn học lớp với ngày hiệu lực và quyết định chuyển; bảo toàn điểm lớp cũ; có quy trình đối chiếu môn khi đổi tổ hợp. Phân quyền ghi theo giai đoạn, quyền xem lịch sử theo chính sách riêng. Bổ sung chuyển trường, thôi học, học lại bằng trạng thái học vụ; không dùng khóa tài khoản thay cho trạng thái học sinh.

### F09 — P1: Chuyển năm chưa có đủ điều kiện và nhánh lớp 12

Bằng chứng: runPromotion kiểm tra lớp đích thuộc năm được chọn, nhưng chưa ràng buộc năm kế tiếp, khối kế tiếp/ở lại, sức chứa hay kết quả đã phê duyệt. Repository createMany skipDuplicates có thể bỏ qua học sinh đã được ghi danh khác mà không chỉ rõ xung đột.

Đề xuất: xem trước theo từng học sinh, kiểm tra học vụ và sĩ số; chặn xung đột thay vì bỏ qua mơ hồ. Lớp 12 có hồ sơ hoàn thành chương trình và trạng thái sau phổ thông, tách khỏi kết quả thi tốt nghiệp THPT; không chuyển lên lớp 13.

### F10 — P1: Khóa sổ, cập nhật đồng thời và truy nguyên chưa khép kín

Bằng chứng: saveScores cho người quản lý bỏ qua khóa; thay điểm bằng xóa/tạo lại rồi tính trung bình ngoài giao dịch ghi điểm. ActivityLog chưa có trước/sau, lý do, người duyệt hay phiên bản dữ liệu. Luồng lưu nhiều học sinh có thể thành công một phần.

Đề xuất: yêu cầu mở khóa có lý do, phạm vi, thời hạn và người duyệt; ghi lịch sử từng thay đổi điểm. Lưu điểm và trung bình trong một giao dịch; kiểm soát phiên bản tránh hai người ghi đè nhau. Phản hồi rõ thành công một phần nếu quy trình cho phép.

### F11 — P1: Kế hoạch giáo dục THPT còn mô hình đơn giản

Bằng chứng: môn của lớp là tập subjectId; số tiết mặc định ở Subject dùng chung. Chưa có kế hoạch theo khối/năm, đăng ký môn/chuyên đề của học sinh, lớp học phần hay tổ chuyên môn. Phân công duy nhất một GV/lớp/môn/kỳ.

Đề xuất: kế hoạch giáo dục năm học, môn bắt buộc/lựa chọn, chuyên đề, số tiết theo giai đoạn; lớp hành chính và nhóm học môn độc lập. Phân công có thời gian hiệu lực và dạy thay. Các trường hợp trường không tổ chức học ghép vẫn dùng cấu hình đơn giản.

### F12 — P1: TKB và lịch thi chưa dùng lịch tài nguyên thống nhất

Bằng chứng: scheduling.service.ts bắt mọi tiết vào phòng cố định của lớp, mỗi lớp một ca; lịch thi kiểm tra tài nguyên giữa các kỳ thi nhưng chưa đối chiếu tiết học thường lệ. TKB chưa có thực thể ngày nghỉ/bù/dạy thay theo ngày.

Đề xuất: lịch năm học và ngoại lệ theo ngày; phòng bộ môn/thí nghiệm; dạy bù và dạy thay có phê duyệt. Khi công bố thi, cảnh báo hoặc tạo phương án thay thế buổi học có liên quan. Phân biệt giờ học quy định tại trường với thời gian thi thực tế.

### F13 — P1: Cần xử lý sai lệch bộ kiểm thử TKB

Chạy từ thư mục app:

`RUN_DATABASE_TESTS=0 node --import tsx --test --test-isolation=none tests/*.test.ts`

Kết quả: 33 ca, 23 qua, 7 lỗi, 3 bỏ qua. Tất cả 7 lỗi ở schedule-options.test.ts. Một nguyên nhân quan sát được: fixture không có shift, thuật toán mặc định ca sáng trong khi cấu hình test chọn chiều. Cần chốt nguồn cấu hình ca học rồi đồng bộ test và thuật toán; không kết luận mọi lỗi là thuật toán sai hay sửa test chỉ để xanh. Các ca cần PostgreSQL chưa chạy; không dùng kết quả này để khẳng định giao dịch/quyền đã được kiểm chứng trên DB.

## Quy trình thống nhất đề xuất

1. Đầu năm: cấu hình năm/học kỳ/lịch → kế hoạch giáo dục → hồ sơ học sinh và giám hộ → ghi danh → đăng ký môn → phân công → duyệt/công bố TKB.
2. Trong kỳ: tiết thực tế → điểm danh từng học sinh/sổ đầu bài → đánh giá theo môn → điều chỉnh có kiểm soát → thông báo cho người có quyền xem.
3. Cuối kỳ: kiểm tra thiếu dữ liệu → GVBM chốt môn → GVCN tổng hợp rèn luyện → duyệt kết quả → khóa và công bố.
4. Cuối năm: tính kết quả từng môn → xét học tập/rèn luyện/chuyên cần → phê duyệt → đánh giá lại/rèn luyện hè nếu cần → xét lại → chuyển năm hoặc hoàn thành chương trình lớp 12.
5. Đầu ra: học bạ/sổ theo dõi/báo cáo lấy từ dữ liệu đã chốt; có phiên bản, người xác nhận và khả năng đối soát.

## Lộ trình nâng cấp

- Đợt 1: sửa F01–F03, phạm vi quyền theo năm học; xử lý sai lệch test; bổ sung test chống sửa dữ liệu ngoài quyền.
- Đợt 2: hoàn thiện F04–F07 và F10; xây bộ quy tắc đánh giá có kiểm thử theo ngưỡng, thiếu điểm, miễn học và chuyển tiếp văn bản.
- Đợt 3: F08–F09 và F11–F12; lịch sử hồ sơ, môn lựa chọn, dạy thay/bù, lịch tài nguyên dùng chung.
- Đợt 4: mẫu biểu học bạ, phê duyệt/ký số và kết nối theo đặc tả Sở/Bộ được cung cấp; kho báo cáo và quản trị chất lượng dữ liệu.
- Mở rộng sau khi lõi ổn định: tuyển sinh đầu cấp, hồ sơ nhân sự/định mức, thiết bị, tài chính. Mỗi phân hệ phải xác định chủ sở hữu và đối soát; không cần xây tất cả cùng lúc.

## Tiêu chí nghiệm thu nên có

- GVCN không sửa học sinh ngoài lớp/năm được phân công; người xem lịch sử không mặc nhiên có quyền ghi.
- Không xét kết quả chính thức khi chưa đủ dữ liệu; điểm 0 khác thiếu điểm; môn nhận xét không bị đổi thành điểm số.
- Quy tắc cả năm, làm tròn, rèn luyện và xét lại có bộ ví dụ được nhà trường xác nhận.
- Lịch sử trước/sau chuyển lớp, đổi giáo viên và thay TKB vẫn truy nguyên được.
- Công bố thi không tạo xung đột tài nguyên chưa được xử lý; phụ huynh chỉ thấy đúng học sinh đã liên kết.
- Báo cáo và học bạ lấy từ cùng phiên bản dữ liệu chốt; phục hồi sao lưu được diễn tập trong môi trường thử.

## Việc cần xác nhận khi phân tích chi tiết với trường

Hướng dẫn Sở/năm học áp dụng; cách tổ chức môn lựa chọn; học một hay hai buổi; phòng bộ môn; người ký duyệt và ủy quyền; mẫu sổ đang dùng; đặc tả tích hợp hiện có; dữ liệu cần chuyển từ hệ thống cũ. Đây là đầu vào để thiết kế triển khai, không phải lý do trì hoãn sửa các lỗi đã xác định.

Cập nhật sau refactor và sửa kiểm thử ca học: toàn bộ 48/48 ca đạt, gồm các ca tích hợp trên PostgreSQL tạm. Fixture khai báo ca học rõ ràng; kiểm tra trùng giáo viên sử dụng hai lớp cùng ca. Kết quả 33 ca ở trên là ghi nhận tại thời điểm rà soát ban đầu.
