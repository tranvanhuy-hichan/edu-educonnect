# Nhân sự, BCH và ban cán sự dùng chung

## Quy tắc tài khoản

- **Chỉ giáo viên được liên kết BCH vào tài khoản EduConnect đang có.** Quyền EduConnect lấy từ `edu.User.roles`; quyền quản trị Đoàn không cấp quyền quản trị EduConnect.
- **Học sinh tham gia BCH phải dùng tài khoản BCH riêng.** Tài khoản học sinh, điểm, lớp, mật khẩu và các quyền học sinh giữ nguyên. Tài khoản BCH riêng không có `edu.User`/`edu.Teacher`/`Member` tự tạo.
- Có thể tạo BCH riêng cho người chưa có hồ sơ giáo viên. Không tạo giáo viên ngầm khi tạo tài khoản BCH.
- Khóa/mở hoặc cấp lại mật khẩu BCH riêng chỉ tác động tài khoản đó. Thu hồi BCH khỏi giáo viên chuyển role Đoàn về EXTERNAL, giữ nguyên trạng thái khóa/mật khẩu/vai trò EduConnect. Cấp lại mật khẩu giáo viên dùng chung có ảnh hưởng đăng nhập cả hai bên và được thông báo trước.
- Quản trị tối cao Đoàn và tài khoản chung chi đoàn không liên kết EduConnect. Thành viên BCH không tự cấp hoặc thu hồi BCH.

## Giao diện

EduConnect: **Tài khoản → Quản lý nhân sự** (`/tai-khoan/nhan-su`) cho ADMIN: tìm nhân sự, sửa vai trò hiệu trưởng/phó hiệu trưởng/giáo viên/thủ thư qua hồ sơ tài khoản, phân công BCH trên giáo viên hiện có; tạo và quản lý tài khoản BCH riêng.

Cổng Đoàn: **Cài đặt → Ban chấp hành**, dành cho quản trị tối cao: chọn **Liên kết tài khoản giáo viên** hoặc **Tạo tài khoản BCH riêng**; sửa chức danh, thu hồi/khóa/mở và đặt lại mật khẩu. Mật khẩu mới chỉ hiển thị một lần; bắt đổi khi đăng nhập.

Chi tiết lớp/chi đoàn có lớp trưởng, bí thư và nhiều cờ đỏ. Bí thư/cờ đỏ vẫn là học sinh thông thường tại EduConnect. Không kiêm bí thư và cờ đỏ; có thể kiêm lớp trưởng. Chuyển lớp/ngừng sinh hoạt tự gỡ phân công cũ. Chức danh Đoàn chỉ phản ánh lớp hiện hành; không dùng chức danh hiện tại làm lịch sử năm cũ.

## Hoạt động độc lập

Không hệ thống nào cần gọi HTTP/API của ứng dụng kia để đăng nhập hoặc quản lý dữ liệu của mình. Dừng một web server không làm web còn lại ngừng hoạt động. Cả hai vẫn cần PostgreSQL tương ứng; việc dùng chung DB production là lựa chọn triển khai, không phải phụ thuộc web server.

Cổng Đoàn có thể dùng database chỉ có schema `public`, không có EduConnect: BCH riêng, mật khẩu, khóa/mở, bí thư/cờ đỏ/lớp trưởng hoạt động bằng bảng của Cổng Đoàn. `EDUCONNECT_INTEGRATION=off` tắt việc tìm/liên kết giáo viên; mặc định tự phát hiện schema. Không che lỗi kết nối DB thành “không có giáo viên”.

Trường `public.Department.presidentId` do Cổng Đoàn sở hữu. `npm run db:push` tạo cấu trúc rồi cài đặt trigger cục bộ từ `prisma/independent-officers.sql`. Có thể chạy lại `node scripts/install-officers.mjs` sau khi tạo cấu trúc; không cần schema EduConnect.

Khi cài EduConnect vào database riêng, tạo các bảng tài khoản `public` theo bản vendor `app/prisma/vendor/khkt.schema.prisma` trên **database trống**, rồi áp dụng migration `edu`. Không cần chạy Cổng Đoàn. Không chạy Prisma db push/reset của EduConnect trên database chung production. Khi dùng chung DB, migration `20261117000000_independent_class_officers` đồng bộ lớp trưởng hai chiều giữa `public.Department.presidentId` và `edu.SchoolClass.monitorStudentId`; EduConnect → Đoàn lỗi thì rollback, Đoàn → EduConnect lỗi thì ghi SyncIssue để Đoàn tiếp tục hoạt động.

## Áp dụng production ngày 13/11/2026

Đã sao lưu `public` và `edu` tại `/tmp/edu-audit/before-independent-bch-20261113.dump` (tệp riêng tư ngoài repository), áp dụng DDL Cổng Đoàn và migration EduConnect mới.

Đã bổ sung 3 hồ sơ giáo viên bằng chính tài khoản BCH được chỉ định. Chỉ cấp vai trò giáo viên bộ môn, chưa tự phân công lớp/môn. Tài khoản đang khóa vẫn khóa; không đổi mật khẩu, tên đăng nhập hay chức danh BCH. Tài khoản BCH của học sinh được loại trừ và giữ tách biệt với tài khoản học sinh; không tạo giáo viên cho học sinh.

Script bảo trì `app/scripts/adopt-union-teachers.ts --account=<username>` chỉ chuyển tài khoản được chỉ định, mặc định transaction rollback để xem trước; `--apply` mới ghi. Chặn tài khoản học sinh/đoàn viên và chặn trường hợp có hồ sơ học sinh trùng họ tên để tránh nhận nhầm. Có thể chạy lại mà không tạo hồ sơ trùng.

## Xác minh

- TypeScript và build production của cả hai dự án đạt.
- EduConnect: 124 test thường đạt; 13 test tích hợp đồng bộ/nhân sự/nhận BCH thành giáo viên đạt trên production, fixture rollback.
- Database cục bộ không có `edu`: kiểm thử trọn vòng BCH riêng, bảo toàn tài khoản học sinh, các chức danh và thu hồi khi chuyển trạng thái đạt.
- Database cục bộ đủ schema, không chạy web EduConnect: kiểm thử liên kết giáo viên, từ chối liên kết học sinh, tạo BCH riêng và thu hồi giáo viên không khóa tài khoản đạt.
- Kiểm tra HTTP có phiên: quản trị truy cập giao diện mới; giáo viên/BCH và học sinh không truy cập quản lý nhân sự EduConnect; BCH thường không thấy chức năng quản trị tối cao Đoàn.
- Snapshot trước/sau xác nhận tên đăng nhập, mật khẩu băm, role Đoàn, trạng thái khóa và cờ đổi mật khẩu của 5 tài khoản liên quan giữ nguyên. Không gộp lịch sử tài khoản.

Các phát hiện cũ ngoài phạm vi: Cổng Đoàn chưa vô hiệu JWT cũ khi đổi mật khẩu; chưa nối lịch tự động gọi đối soát khi chuyển năm học. Build EduConnect còn cảnh báo Edge `node:crypto`; lint toàn dự án có lỗi cũ ngoài phần sửa. Không coi các kiểm tra trên là kiểm chứng mọi nghiệp vụ của hai hệ thống.
