# Lưu tệp học liệu

## Cấu hình

`STORAGE_PROVIDER` nhận `cloudinary` hoặc `minio`, mặc định `cloudinary` khi bỏ trống. Cấu hình sai hoặc backend thiếu khóa sẽ báo lỗi; không tự chuyển sang kho khác.

Cloudinary dùng ba biến `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Tệp học liệu được tải dạng `raw`, `authenticated`, giữ nguyên nội dung. Logo trường tiếp tục dùng luồng ảnh Cloudinary sẵn có.

MinIO dùng `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_REGION`. Endpoint nhận URL, ví dụ `https://files.example.edu.vn`, hoặc tên máy chủ kèm `MINIO_PORT`/`MINIO_USE_SSL`. Tạo bucket private trước; tài khoản dịch vụ cần quyền đọc/ghi/xóa đối tượng trong bucket. Endpoint phải truy cập được từ cả máy chủ và trình duyệt vì link tải là link ký ngắn hạn.

Xem mẫu tại `app/.env.example`. Không đưa khóa bí mật vào biến `NEXT_PUBLIC_*`.

## Luồng sử dụng

- Giáo viên chọn tệp trực tiếp khi tạo/sửa giáo án, bài học hoặc bài tập. Giáo án hiện nhận một tệp; bài học/bài tập nhận tối đa 10 tệp.
- Học sinh có thể nộp nội dung, tệp hoặc cả hai; bài đã chấm không được thay tệp.
- Tệp được tải qua `/api/uploads`; form chỉ lưu đường dẫn `/api/files/<id>`, không gửi tệp lớn lại qua Server Action.
- Chọn lớp–môn trước khi tải tệp trong form tạo mới. Tệp tải ở lớp–môn khác sẽ bị từ chối khi lưu.
- Đường dẫn bên ngoài đã có được giữ lại để tương thích dữ liệu cũ. Form mới dùng chọn tệp.
- Khi bấm tải, server kiểm tra tài khoản và phạm vi dữ liệu trước khi tạo link ký có hạn 60 giây. Giữ phạm vi xem học liệu theo lớp–môn hiện có; học sinh không tải được bài nộp của bạn khác.
- Bỏ một đính kèm khỏi form không xóa ngay đối tượng trên cloud: tệp có thể còn được tham chiếu ở nơi khác. Tệp tải lên nhưng chưa lưu nội dung cũng chưa chia sẻ cho học sinh khác. Cần bổ sung công việc dọn tệp mồ côi theo chính sách lưu trữ của trường khi vận hành lâu dài.

## Thay backend

Mỗi dòng `StoredFile` lưu provider, key và bucket của chính tệp. Thay `STORAGE_PROVIDER` chỉ đổi nơi lưu tệp mới. Giữ các cấu hình của backend cũ để tệp cũ tiếp tục tải được. Chuyển provider không tự sao chép hoặc xóa dữ liệu; đổi luôn tài khoản Cloudinary/endpoint MinIO cần kế hoạch di chuyển riêng.

`UPLOAD_MAX_MB` mặc định 10, cho phép 1–10 MB mỗi tệp. Giới hạn được áp dụng ở cả form và server, có giới hạn đọc request trước khi phân tích multipart. Hosting hoặc reverse proxy có thể áp giới hạn thấp hơn; tăng biến này không tự tăng giới hạn hạ tầng. Tệp lớn hơn cần triển khai upload thẳng bằng URL ký hoặc multipart thay cho endpoint proxy hiện tại.

## CSDL và triển khai

Migration mới: `app/prisma/migrations/20261110190000_content_file_storage/migration.sql`. Tạo bảng StoredFile và thêm attachments cho bài nộp. Cần áp dụng migration, chạy Prisma generate rồi khởi động lại ứng dụng.

Cũng có migration nghiệp vụ `20261110180000_academic_workflows` của phần việc trước. Chưa tự áp dụng vào CSDL đang dùng. Trong kiểm thử, phát hiện schema hiện có nhiều thay đổi cũ chưa được ghi đủ trong migration (khóa học kỳ, tokenVersion, ca học, thông báo, phụ huynh, một số trường thư viện); cần đối soát baseline hiện tại trước khi đưa lên môi trường khác. Không dùng db push --accept-data-loss trên CSDL thật để bỏ qua chênh lệch này.

Nguồn API: [Cloudinary — upload và kiểm soát truy cập](https://cloudinary.com/documentation/upload_parameters), [MinIO JavaScript SDK](https://github.com/minio/minio-js/blob/master/docs/API.md).
