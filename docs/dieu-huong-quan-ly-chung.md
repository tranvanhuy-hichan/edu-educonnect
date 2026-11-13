# Điều hướng quản trị thống nhất

Cả hai sidebar quản trị có **Tài khoản & Nhân sự** và **Cấu hình & Cài đặt**. Các trang lớp/học sinh/chi đoàn/đoàn viên giữ nguyên. Không thêm quyền quản trị cho học sinh, giáo viên hay BCH thường chỉ vì có trang quản lý mới.

## Tài khoản & Nhân sự

Ba tab ngang: **Tài khoản**, **Nhân sự & BCH**, **Bảo mật**.

- EduConnect: `/tai-khoan`, `/tai-khoan/nhan-su`, `/tai-khoan/bao-mat`. Rà soát tài khoản nằm trong Bảo mật; vai trò ADMIN tiếp tục được bảo vệ ở cả giao diện và server.
- Cổng Đoàn: `/accounts?tab=accounts|personnel|security`. Danh sách tài khoản có tìm kiếm, lọc trạng thái và phân trang. BCH/giáo viên nằm trong Nhân sự & BCH; cấp lại mật khẩu theo lớp nằm trong Bảo mật. Chỉ quản trị tối cao có thao tác cấp/sửa/thu hồi BCH; BCH thường chỉ xem danh sách.
- Học sinh BCH dùng tài khoản riêng; chỉ giáo viên được liên kết. Không thay đổi dữ liệu tài khoản khi mở trang hoặc chuyển tab.

## Cấu hình & Cài đặt

Cùng năm tab ngang, rộng toàn vùng nội dung; không có sidebar cài đặt thứ hai:

| Tab | EduConnect | Cổng Đoàn |
| --- | --- | --- |
| Năm học | Năm học, HK1/HK2 | Năm học và lịch tuần dùng chung |
| Danh mục | Khối lớp; lối tắt môn học, phòng học | Danh mục kế hoạch |
| Quy chế | Quy chế chung; hệ số điểm | Giới hạn điểm trò chơi |
| Giao diện | Thông tin/giao diện trường | Thông tin website, menu, dòng chữ chạy, trang giới thiệu |
| Hệ thống | Lối tắt vận hành, nhật ký, thùng rác, API | Dung lượng và dọn dữ liệu |

Các chức năng riêng vẫn theo quyền từng ứng dụng. Thay đổi bố cục không đồng bộ nhầm cấu hình giao diện hoặc điểm của hai sản phẩm.

Cài đặt cá nhân Cổng Đoàn chuyển sang `/settings/profile` với ba tab Hồ sơ, Bảo mật (mật khẩu và đăng nhập nhanh), Thông báo. Menu tài khoản trên thanh đầu trang trỏ đến đây; người không có quyền quản trị chỉ thấy cài đặt cá nhân.

## Tương thích đường dẫn cũ

Cổng Đoàn chuyển `settings?tab=leaders` đến Nhân sự & BCH; `classpw` đến Bảo mật; `plancats` đến Danh mục; `gamecap` đến Quy chế; `account/password/passkey/notifications` đến cài đặt cá nhân tương ứng. Các trang cấu hình website cũ giữ nguyên URL nhưng dùng tab ngang chung.

EduConnect vẫn nhận `cau-hinh?tab=grades` và `tab=weights`, mở đúng Danh mục và Quy chế → Hệ số điểm. Không yêu cầu migration database cho thay đổi điều hướng này.
