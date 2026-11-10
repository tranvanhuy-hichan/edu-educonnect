# Cập nhật ứng dụng và cơ sở dữ liệu

Build (`prisma generate && next build`) chỉ tạo Prisma Client và ứng dụng, không áp dụng migration vào DB. Deploy code có model mới trước DB có thể gây Prisma P2022 và React #441 ở trang cần đăng nhập.

## Cập nhật production

Tại thư mục gốc repository, dùng biến `DATABASE_URL` và `DIRECT_URL` của đúng môi trường production. `DIRECT_URL` phải là kết nối hỗ trợ migration, không phải transaction pooler. Sao lưu DB trước đợt nâng cấp.

```sh
npm run prisma:status
npm run prisma:deploy
npm run build
```

Triển khai/khởi động lại ứng dụng sau khi migration thành công. Nếu build chạy trên Vercel, thực hiện bước migration trong quy trình phát hành trước khi chuyển traffic sang bản mới; không tự chạy migration trong request của người dùng.

Nếu Prisma báo migration thất bại hoặc DB đã tồn tại nhưng chưa có lịch sử migration, dừng và đối chiếu baseline/lịch sử trước. Repository có một số thay đổi schema cũ chưa được ghi đầy đủ trong migration; không dùng `migrate reset`, `db push --accept-data-loss` hay tự `resolve --applied` để bỏ qua lỗi trên DB thật.

## Lỗi ActivityLog.beforeData không tồn tại

Migration `20261110180000_academic_workflows` thêm `ActivityLog.beforeData`, `afterData`, `reason` và các cấu trúc nghiệp vụ mới. Migration `20261110190000_content_file_storage` thêm lưu tệp. Cần áp dụng cả những migration đang chờ của bản phát hành, không chỉ thêm riêng một cột để hết lỗi trang chủ.

Trang tổng quan lấy phần tóm tắt nhật ký bằng `select` rõ ràng, không đọc các cột chi tiết trước/sau. Thay đổi này khắc phục truy vấn gây lỗi tại trang chủ trong log; trang nhật ký chi tiết và các nghiệp vụ mới vẫn yêu cầu DB đã được cập nhật đầy đủ.

## Ghi nhận xử lý DB Sơn Hà ngày 10/11/2026

DB có cấu trúc và dữ liệu hiện hữu nhưng không ghi nhận các migration trong repository. Sau khi đối chiếu schema thực tế, đã áp dụng SQL của `20261110180000_academic_workflows` và `20261110190000_content_file_storage` trực tiếp trong một transaction, dừng và rollback nếu có lỗi. Chỉ lưu cấu trúc trước cập nhật, không xuất dữ liệu production ra máy.

Kiểm chứng sau cập nhật: truy vấn `activityLog.findMany` từng báo P2022 đã chạy thành công; bốn bảng mới truy cập được; `prisma migrate diff` giữa DB thực tế và schema ứng dụng trả về empty migration. Ngày bắt đầu lớp của bản ghi cũ vẫn để NULL.

Chưa tự đánh dấu các migration cũ là applied. Lịch sử migration cần được baseline riêng trước lần chạy `prisma:deploy` tiếp theo; không chạy lại hai SQL vừa áp dụng hoặc toàn bộ chuỗi migration cũ trên DB này. Trạng thái lịch sử migration và trạng thái cấu trúc DB là hai kiểm tra khác nhau.
