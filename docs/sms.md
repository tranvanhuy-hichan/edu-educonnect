# SMS cho phụ huynh (eSMS.vn)

Có hai việc, cùng bật bằng cách khai báo khoá eSMS. **Không có khoá thì mọi thứ dưới đây tắt và hệ thống chạy như trước** (phụ huynh đăng nhập bằng mật khẩu mặc định 123456).

## 1. Kích hoạt
1. Đăng ký tài khoản tại esms.vn, nạp tiền, lấy **ApiKey** và **SecretKey** (trang quản lý → Tài khoản/API).
2. Vercel → Environment Variables: `ESMS_API_KEY`, `ESMS_SECRET_KEY`. Tuỳ chọn: `ESMS_SMS_TYPE`, `ESMS_BRANDNAME`, `SMS_EVENTS`, `SMS_DAILY_LIMIT`, `SMS_PHONE_DAILY_LIMIT` (xem `app/.env.example`). Deploy lại.
3. **Thử trước bằng Sandbox:** đặt `SMS_SANDBOX=1`. eSMS nhận yêu cầu nhưng không gửi thật, không tốn tiền; trang `/van-hanh` hiện "SMS: bật" và đếm số lần gọi. Chạy thử đăng nhập phụ huynh để xem mã lỗi (nếu có), rồi bỏ `SMS_SANDBOX`.
4. **Loại tin & Brandname:** mặc định `SmsType=8` (đầu số cố định, đăng ký nhanh nhất). Muốn tin hiện tên trường (Brandname) phải đăng ký Brandname với eSMS/nhà mạng (mất vài ngày), sau đó đặt `ESMS_SMS_TYPE=2` và `ESMS_BRANDNAME=<tên đã duyệt>`. Nội dung luôn gửi **không dấu** (160 ký tự/tin, không phụ phí Unicode).

> Mình chưa thể gọi thử eSMS thật khi viết tính năng này (cần tài khoản của trường). Mã tích hợp theo tài liệu REST API v4 của eSMS và được kiểm tra bằng bộ giả lập; **hãy chạy Sandbox ở bước 3 trước khi dùng thật** và đối chiếu mã lỗi trên `/van-hanh` nếu có.

## 2. Khi bật SMS, hệ thống làm gì
**Thông báo SMS (cùng lúc với thông báo trong ứng dụng)**
- Giáo viên lưu điểm làm thay đổi điểm đang hiển thị → `score_changed`
- Công bố điểm học kỳ → `grades_published`
- Ghi vắng mặt trong sổ đầu bài → `absence`
- Mỗi phụ huynh chỉ nhận **một** tin cho mỗi lần: nhiều con/nhiều thông báo cùng lúc được gộp thành tin tóm tắt. SMS đi qua hàng đợi nền nên không làm chậm giáo viên.
- Chống phát sinh chi phí: tối đa `SMS_PHONE_DAILY_LIMIT` (mặc định 5) tin thông báo/số/24 giờ và `SMS_DAILY_LIMIT` (mặc định 3000) tin/24 giờ toàn trường. Chạm hạn mức thì bỏ qua (ghi "bỏ qua" trong nhật ký) chứ không gửi tiếp. Gặp 5 lỗi liên tiếp (hết tiền, sai khoá…) thì dừng lô.

**Xác minh phụ huynh**
- **Lần đầu đăng nhập hoặc quên mật khẩu:** nhập số điện thoại (hoặc mã học sinh) → nhận mã 6 số → nhập mã → **bắt buộc đặt mật khẩu mới** → mới xem được Sổ liên lạc. Không còn tạo tài khoản bằng mật khẩu mặc định 123456.
- **Tài khoản đã có từ trước:** đăng nhập bằng mật khẩu như cũ nhưng **chưa xem được gì cho đến khi xác minh số điện thoại bằng mã SMS một lần**; nếu còn dùng mật khẩu 123456 thì bị bắt đổi.
- Chặn ở máy chủ (không chỉ ẩn giao diện): trang, thao tác và API thông báo đều từ chối khi chưa xác minh hoặc chưa đổi mật khẩu.
- Mã: 6 số, hiệu lực 5 phút, dùng một lần, sai quá 5 lần thì vô hiệu, chỉ lưu dạng băm. Giới hạn: 1 mã/phút và 3 mã/10 phút cho mỗi số, 10 mã/giờ cho mỗi IP.
- Số điện thoại phải là số di động Việt Nam hợp lệ và là số **người giám hộ** trong hồ sơ học sinh. Hồ sơ trống hoặc sai số thì phụ huynh không nhận được mã: nhờ giáo viên chủ nhiệm cập nhật.

## 3. Theo dõi
- `/van-hanh` → mục **SMS cho phụ huynh**: trạng thái, số tin 24 giờ qua (thành công/lỗi/bỏ qua) và các lỗi gần nhất kèm mã lỗi eSMS (ví dụ 103 = hết tiền, 101 = sai khoá, 104 = Brandname chưa duyệt).
- Nhật ký `SmsLog` **không lưu số điện thoại rõ** (chỉ băm và dạng che `090****123`) và **không lưu nội dung tin**; tự xoá sau 90 ngày.
- Nhớ nạp tiền eSMS và đặt cảnh báo số dư ở phía eSMS: hết tiền thì mã xác minh không gửi được và phụ huynh mới không thể kích hoạt tài khoản.

## 4. Áp dụng vào DB thật
Cần migration `20261116000000_sms_parent_verification` (cột `ParentAccount.phoneVerifiedAt`, `mustChangePwd`, bảng `ParentOtp`, `SmsLog`). Áp dụng **trước** khi deploy và trước khi đặt khoá SMS. Xem `docs/trien-khai.md` và `docs/sua-db-thieu-bang.sql`.
