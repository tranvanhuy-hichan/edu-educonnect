# Rà soát bảo mật, nghiệp vụ và dữ liệu EduConnect

Ngày: 12/11/2026. Mã nguồn được rà soát: `8aeeca1` trên `main`.

## Kết luận và phạm vi

Chưa đủ cơ sở xác nhận dự án sẵn sàng vận hành với dữ liệu học sinh thật. Có lỗi xác thực phụ huynh nghiêm trọng, sai phạm vi dữ liệu, thiếu bảo vệ trước cập nhật đồng thời và thiếu một số ràng buộc nghiệp vụ.

Đây là rà soát mã có chọn lọc và chạy kiểm thử cục bộ, không phải chứng nhận an toàn hay đánh giá toàn bộ hệ thống. Không đăng nhập production, không đọc nội dung `.env`, không ghi vào database thật, không thử khai thác hoặc gây tải lên dịch vụ. Các tác động mô tả từ đường đi mã nguồn; lỗi đồng thời cần tái hiện với PostgreSQL riêng. Chưa đối chiếu đầy đủ quy chế giáo dục hiện hành, cấu hình database/RLS, hạ tầng triển khai, bản sao lưu, lịch sử Git chứa bí mật, log truy cập hoặc chính sách nhà cung cấp AI.

Mức độ dưới đây là đánh giá ưu tiên của lần rà soát, không phải điểm CVSS.

## Phát hiện

### F01 — Nghiêm trọng: chiếm quyền tài khoản phụ huynh ở lần đăng nhập đầu

Nguồn: `app/src/app/phu-huynh/actions.ts:93–180`.

`parentLogin` tìm học sinh bằng mã, email hoặc điện thoại người giám hộ. Khi chưa có ParentAccount, hàm tự tạo tài khoản nếu mật khẩu nhập là `123456`, rồi cấp cookie. Không có OTP, mã mời riêng hoặc phê duyệt của nhà trường. Người biết mã học sinh có thể đăng nhập trước người giám hộ, xem dữ liệu liên kết và đổi mật khẩu để giữ tài khoản. Hồ sơ chưa có điện thoại còn dùng `normalized || input` làm định danh thay thế, khiến điều kiện kiểm tra thiếu điện thoại không đáng tin cậy.

Khắc phục: bỏ tự kích hoạt bằng mật khẩu chung; dùng mã mời ngẫu nhiên, dùng một lần, có hạn, hoặc xác minh số điện thoại đã đăng ký. Liên kết tài khoản với từng học sinh phải do nhà trường xác nhận. Không suy ra quyền giám hộ từ việc biết mã học sinh.

### F02 — Cao: liên kết con bằng so khớp chuỗi điện thoại quá rộng

Nguồn: `app/src/app/phu-huynh/page.tsx:50–60`; `app/src/app/phu-huynh/actions.ts:108–147`.

Trang phụ huynh lấy học sinh bằng `startsWith(parent.phone)` và `contains(last9Digits)`, thay vì quan hệ đã xác nhận. Nếu dữ liệu có số ngắn, nhiều số ghép hoặc trường điện thoại không chuẩn, tài khoản có thể khớp thêm học sinh ngoài phạm vi. Đăng nhập dùng `students[0]` cũng không xử lý nhiều kết quả mơ hồ. Khả năng lộ chéo thực tế phụ thuộc dữ liệu hiện có.

Khắc phục: chuẩn hóa số khi nhập dữ liệu, từ chối số không hợp lệ, tạo bảng liên kết ParentAccount–Student có khóa ngoại và trạng thái xác nhận; tra cứu quyền bằng liên kết này. Kiểm thử số có tiền tố, hậu tố và hai người giám hộ khác nhau.

### F03 — Cao: cùng một lượt thi có thể bị ghi kết quả nhiều lần khi có yêu cầu đồng thời

Nguồn: `app/src/modules/question/quiz.service.ts:136–149`; `app/src/modules/question/quiz.repository.ts:49–72`.

Việc đọc số lượt và lượt đang làm xảy ra trước transaction. `recordAttempt` cập nhật bằng `id`, không yêu cầu `submittedAt IS NULL`, không khóa lượt và không kiểm tra số hàng được chuyển trạng thái. Hai yêu cầu đã cùng đọc một lượt đang mở có thể lần lượt cập nhật cùng bản ghi. Unique `(exerciseId, studentId, attemptNo)` chỉ chặn tạo trùng, không chặn update lặp. Ở chế độ LAST có nguy cơ ghi đè đáp án; ở BEST lịch sử lượt có thể khác điểm bài nộp đang giữ.

Khắc phục: chốt lượt bằng cập nhật có điều kiện trong cùng transaction, kiểm tra count=1; tuần tự hóa việc cấp lượt/tính tổng kết theo học sinh và bài thi. Kết quả nộp lại phải idempotent. Cần integration test hai yêu cầu đồng thời với đáp án khác nhau.

### F04 — Cao: mất nội dung lịch sử bài làm khi cho làm lại hoặc xóa bài học

Nguồn: `app/src/modules/question/quiz.repository.ts:77–78`; `app/src/modules/content/content.repository.ts` (`exerciseDeletion`); `app/src/modules/content/content.service.ts:220–242`.

Cho làm lại xóa bài nộp, đáp án, mọi QuizAttempt và ExamViolation của học sinh. Xóa bài tập/bài học xóa cả dữ liệu bài làm, không chặn khi đã có bài nộp. Ngoài ra, QuizAttempt chỉ giữ thông tin lượt và điểm; đáp án nằm ở AssignmentSubmission. Khi một lượt mới thay thế kết quả, đáp án của lượt cũ bị xóa; khi điểm không được chọn, đáp án lượt đó không được lưu. Vì vậy danh sách lịch sử điểm không tương đương lịch sử bài làm đầy đủ.

Khắc phục: snapshot đề, đáp án đã chọn và kết quả chấm theo từng lượt; dùng trạng thái archive/void, ghi lý do và người thao tác. Cho thêm lượt thay vì xóa bằng chứng. Định nghĩa thời hạn lưu và quyền xóa dữ liệu.

### F05 — Cao: quy chế thi nghiêm túc chưa được cưỡng chế ở máy chủ

Nguồn: `app/src/modules/question/quiz.service.ts:136–149,194–218`; `app/src/app/(app)/bai-hoc/[id]/secure-quiz.tsx`.

`reportViolation` chỉ trả `exceeded`; `submitQuiz` không lấy lại số vi phạm để cưỡng chế chốt lượt. Bài secureMode nhưng không giới hạn giờ cũng không bắt buộc active attempt khi nộp, vì điều kiện chỉ kiểm tra timeLimitMinutes. Người sửa client có thể bỏ báo vi phạm hoặc bỏ bước bắt đầu và nộp trực tiếp. Không nên coi tín hiệu fullscreen/tab từ trình duyệt là bằng chứng chống gian lận đáng tin tuyệt đối.

Khắc phục: bài secure phải có lượt máy chủ đang hoạt động; máy chủ cưỡng chế các vi phạm đã ghi nhận, hạn giờ và trạng thái nộp. Xác định rõ giới hạn giám sát của trình duyệt trong quy trình tổ chức thi.

### F06 — Trung bình: lộ lịch thi chưa công bố ở cổng phụ huynh

Nguồn: `app/src/app/phu-huynh/page.tsx:103–122,243–254`.

Truy vấn examSeats include event nhưng không lọc trạng thái công bố; toàn bộ ghế thi được map sang Client Component. Nếu bản nháp đã có ghế, phụ huynh có thể nhận lịch nháp. Lịch bị thu hồi/hủy cũng không được phân biệt ở DTO hiện tại.

Khắc phục: dùng chung policy hiển thị lịch cho học sinh và phụ huynh; chỉ đưa bản đã công bố hoặc thông tin hủy đúng đối tượng xuống client. Kiểm thử DRAFT, PUBLISHED, thu hồi và CANCELLED.

### F07 — Trung bình: yêu cầu đổi mật khẩu chỉ được áp dụng ở giao diện

Nguồn: `app/src/components/layout/shell.tsx:138–152`; `app/src/lib/guard.ts`; `app/src/app/(app)/doi-mat-khau/actions.ts`; `app/src/lib/auth/parent-session.ts`.

Shell chuyển hướng khi mustChangePwd, nhưng `assertRole`, các service và API không chặn tài khoản ở trạng thái này. Người gọi trực tiếp thao tác vẫn có quyền. Đổi/reset mật khẩu không có version phiên hoặc thời điểm vô hiệu token, nên JWT đã cấp vẫn tồn tại theo hạn token; getMe đối chiếu isActive giúp khóa tài khoản nhưng không giải quyết thu hồi khi đổi mật khẩu. Phụ huynh có token 30 ngày và vấn đề tương tự.

Khắc phục: kiểm tra trạng thái phải đổi mật khẩu phía máy chủ, ngoại lệ rõ cho đổi mật khẩu/đăng xuất; thêm sessionVersion hoặc session store và thu hồi phiên khi reset/đổi mật khẩu.

### F08 — Trung bình: endpoint /api/auth/me dùng danh tính JWT cũ

Nguồn: `app/src/lib/api/handler.ts:27–35`; `app/src/lib/auth/request-session.ts`; `app/src/app/api/auth/me/route.ts`.

withAuth chỉ verify JWT, không gọi resolveSessionIdentity. Sau khóa hoặc đổi vai trò, /api/auth/me vẫn có thể trả danh tính/quyền cũ đến khi token hết hạn. Các endpoint upload/import dùng getMe nên không có cùng lỗi này. Chưa thấy đường ghi dữ liệu nhạy cảm hiện tại dùng withAuth; không kết luận đây là bypass toàn bộ ứng dụng.

Khắc phục: thống nhất cơ chế lấy danh tính hiện hành cho page, action và API, kiểm thử khóa/đổi quyền khi phiên đang tồn tại.

### F09 — Trung bình: thiếu chống dò tài khoản và thử mật khẩu trong mã đăng nhập

Nguồn: `app/src/app/api/auth/login/route.ts`; `app/src/modules/auth/auth.service.ts`; `app/src/app/phu-huynh/actions.ts`.

Chưa thấy limiter theo IP/tài khoản trong các luồng này. Phụ huynh nhận lỗi khác nhau khi không có học sinh, tài khoản chưa tạo và sai mật khẩu, giúp dò tồn tại hồ sơ. Có thể hạ tầng đã có WAF/rate limit, nhưng chưa kiểm tra nên không giả định được bảo vệ.

Khắc phục: limiter dùng kho chia sẻ, trì hoãn tăng dần, thông báo lỗi chung và giám sát bất thường; tránh khóa cứng dễ bị lợi dụng để khóa tài khoản người khác.

### F10 — Trung bình: đường nhập tài liệu có rủi ro cạn tài nguyên

Nguồn: `app/src/app/api/imports/route.ts:19–29`; `app/src/modules/importer/docx-parser.ts:31–35,51`.

Route chỉ kiểm Content-Length trước request.formData; header thiếu hoặc truyền chunked vẫn khiến body được parse trước kiểm dung lượng thực. Khác với uploads, imports chưa giới hạn streaming. DOCX được giải nén thành XML/ảnh trước khi giới hạn kích thước từng ảnh; chưa thấy giới hạn tổng dữ liệu giải nén, số entry hoặc độ sâu XML. Rủi ro DoS phụ thuộc giới hạn nền tảng và tài nguyên tiến trình; chưa thử tải độc hại.

Khắc phục: giới hạn byte đọc thực trước parse, kiểm quyền sớm, giới hạn dữ liệu giải nén và số phần tử; worker riêng với timeout/quota. Kiểm tra chữ ký nội dung vì validateUpload hiện chủ yếu dựa vào đuôi tệp.

### F11 — Cao về nghiệp vụ: chuyển năm chưa ràng buộc khối đích theo kết quả

Nguồn: `app/src/modules/promotion/promotion.service.ts:72–90`.

Job kiểm tra năm đích, kết quả đã duyệt và sĩ số nhưng không so khối lớp nguồn/đích. Học sinh O_LAI vẫn có thể được chỉ định sang khối cao hơn; LEN_LOP có thể vào khối không phù hợp nếu người có quyền gửi lựa chọn đó. Đây là lỗi toàn vẹn nghiệp vụ của người dùng có quyền, không phải vượt xác thực.

Khắc phục: mô hình hóa thứ tự khối và quy tắc chuyển khối; ở lại giữ khối, lên lớp sang khối kế, cuối cấp có luồng tốt nghiệp. Ngoại lệ cần quyền và lý do riêng. Xem xét thêm quy tắc năm đích liền kề, thay vì chỉ sau năm nguồn.

### F12 — Trung bình: nộp lại tự luận có thể chạy đua với chấm điểm

Nguồn: `app/src/modules/content/content.service.ts:166–183`; `app/src/modules/content/content.repository.ts` (`updateSubmission`, `gradeSubmission`).

Service đọc grade=null trước khi cho nộp lại; update sau đó chỉ lọc id. Nếu giáo viên chấm giữa hai thao tác, nội dung có thể bị thay sau khi đã có điểm. Cần tái hiện đồng thời để xác nhận hành vi thực tế PostgreSQL.

Khắc phục: update có điều kiện grade=null và kiểm số hàng, hoặc khóa bản ghi trong transaction; lưu phiên bản bài làm mà giáo viên chấm.

## Kiểm chứng đã chạy

46/46 kiểm thử đạt, không skip, từ các file:

```text
tests/quiz-attempts.test.ts
tests/quiz-shuffle.test.ts
tests/policy.test.ts
tests/academic-workflows.test.ts
tests/auto-schedule.test.ts
tests/exam-planning.test.ts
```

Các kiểm thử này hỗ trợ đánh giá công thức/chính sách/thuật toán; không chứng minh không có lỗi xác thực hoặc race condition. Chưa chạy integration test với database thật hoặc production build trong lần rà soát này.

`npm audit --json` ghi nhận 17 mục package bị ảnh hưởng: 6 high, 11 moderate, 0 critical. Có nhiều mục lan truyền từ cùng dependency, không tương đương 17 cách khai thác độc lập. Các chuỗi đáng xem: MinIO → query-string/decode-uri-component và stream-json; Prisma → @prisma/config/deepmerge-ts; KaTeX; ExcelJS → uuid; công cụ ESLint → minimatch. Chưa chứng minh input tấn công đi tới từng API bị ảnh hưởng. Không chạy audit fix --force: một số đề xuất đổi major hoặc hạ phiên bản, cần đánh giá tương thích và phạm vi sử dụng trước.

Điểm tích cực: getMe kiểm tra lại tài khoản trong DB; cookie httpOnly, secure ở production và SameSite=lax; bcrypt cho mật khẩu; các đoạn raw SQL phụ huynh dùng tham số; nhiều use case kiểm quyền theo assignment; ghi điểm có transaction, khóa enrollment, kiểm miễn đánh giá và kết quả đã duyệt; tệp Cloudinary authenticated/MinIO private với URL có hạn. `app/.env` không nằm trong danh sách tệp Git đang theo dõi. Các điểm này không xác nhận toàn bộ lịch sử Git hay cấu hình production an toàn.

## Thứ tự xử lý và điều kiện nghiệm thu

1. F01–F02: đóng đường kích hoạt mặc định và chuyển liên kết phụ huynh sang quan hệ xác minh. Tạo kiểm thử không thể truy cập con của tài khoản khác.
2. F03–F05 và F12: chốt lượt một lần, snapshot lịch sử, cưỡng chế trạng thái thi ở server; kiểm thử đồng thời trên PostgreSQL tách biệt.
3. F06–F09: thống nhất phân quyền, công bố và thu hồi phiên; bổ sung chống thử đăng nhập.
4. F10–F11: giới hạn tài nguyên nhập tài liệu, ràng buộc khối đích; kiểm thử dữ liệu sai và ngoại lệ.
5. Rà từng dependency advisory theo đường sử dụng, nâng cấp có kiểm thử; kiểm chứng migration trên bản sao database đã ẩn danh và diễn tập khôi phục backup.

Trước khi kết luận “chuẩn nghiệp vụ”, cần người phụ trách học vụ xác nhận ma trận vai trò, quy tắc đánh giá/xét lên lớp, xử lý cuối cấp, ngoại lệ miễn đánh giá, khóa/mở sổ và công bố/thu hồi. Chính sách cấu hình chạy đúng test chưa đồng nghĩa phù hợp quy định áp dụng cho trường.

Tham chiếu phương pháp: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Kết quả phát hiện ở trên dựa vào mã nguồn repository, không suy ra chỉ từ checklist.
