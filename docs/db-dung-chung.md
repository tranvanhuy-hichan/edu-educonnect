# DB dùng chung với Cổng thông tin Đoàn (khkt)

EduConnect và Cổng thông tin Đoàn (khkt-congthongtindoan) dùng **một database PostgreSQL**, chia theo schema:

| Schema | Chủ sở hữu | Nội dung |
| --- | --- | --- |
| `public` | **khkt** | bảng của khkt: tài khoản (`User`), đoàn viên (`Member`), chi đoàn, lớp, năm học... |
| `edu` | **EduConnect** | toàn bộ bảng của EduConnect (điểm, thời khoá biểu, thi, thư viện...) |

## Tài khoản
- Tên đăng nhập, mật khẩu (bcrypt), trạng thái khoá và cờ "phải đổi mật khẩu" chỉ lưu ở `public."User"`. Đổi mật khẩu ở hệ thống nào cũng có hiệu lực ở cả hai (phiên của bên kia bị đăng xuất).
- `edu."User"` là hồ sơ riêng của EduConnect (vai trò, khoá tạm do nhập sai, onboarding), trỏ tới tài khoản bằng `accountId`.
- Tài khoản chỉ của EduConnect (giáo viên, nhân sự) có vai trò khkt `EXTERNAL`: khkt từ chối đăng nhập và không gửi thông báo cho họ.
- **Admin tách riêng:** tài khoản khkt `ADMIN`/`DEPARTMENT_ACCOUNT` không thể gắn với EduConnect (trigger DB + kiểm tra khi đăng nhập).
- Cho đoàn viên dùng EduConnect: `npx tsx scripts/adopt-khkt-members.ts` (chạy thử) rồi thêm `--apply`.

## Quy tắc bắt buộc
1. **Không bao giờ đặt bảng EduConnect vào `public`.** `prisma db push` của khkt coi chúng là bảng thừa: build khkt thất bại, hoặc xoá bảng nếu bị ép.
2. **Migration EduConnect chỉ chạm schema `edu`** (CI: `npm run db:schema:check`). Đổi bảng khkt phải làm ở dự án khkt, chỉ thêm cột, rồi chép lại `prisma/vendor/khkt.schema.prisma`.
3. **SQL thô phải ghi rõ schema:** `FROM "edu"."Job"`, không phải `FROM "Job"`.
4. Khoá ngoại `edu → public` là `RESTRICT`: khkt không xoá được tài khoản/đoàn viên còn dữ liệu EduConnect (khkt báo lỗi thân thiện).

## Schema Prisma
`prisma/schema.prisma` là **tệp sinh tự động**: `prisma/edu.prisma` (sửa ở đây) + bản sao khkt (`prisma/vendor/khkt.schema.prisma`, model đổi tên tiền tố `Doan`, giữ tên bảng bằng `@@map`).
```
npm run db:schema          # sinh lại schema.prisma
npm run db:schema:check    # CI: schema.prisma khớp, migration chỉ chạm edu
node scripts/build-schema.mjs --khkt ../../khkt-congthongtindoan/prisma/schema.prisma   # bản vendor còn khớp khkt?
```

## Migration
Không dùng `prisma migrate dev/deploy` (Prisma từ chối vì `public` không rỗng).
```
DIRECT_URL=<DB dev> npm run db:new-migration -- ten_thay_doi   # tạo prisma/migrations/<ts>_ten_thay_doi/migration.sql
npm run prisma:status      # liệt kê migration chờ áp dụng (không ghi gì)
npm run prisma:deploy      # áp dụng (lịch sử ở edu."_prisma_migrations"), an toàn khi chạy lặp lại
```
Chuỗi migration cũ nằm ở `prisma/migrations-legacy/` (chỉ để tham khảo).

## Triển khai lên DB của khkt (một lần)
1. Sao lưu: `scripts/ops/backup.sh` (đã gồm cả `public` và `edu`). **Khôi phục ghi đè cả hai schema.**
2. Triển khai khkt trước (thêm giá trị enum `EXTERNAL`).
3. `npm run prisma:status`, rồi `npm run prisma:deploy`.
4. Nạp đoàn viên: `adopt-khkt-members.ts` (chạy thử → `--apply`).
5. Đặt `DATABASE_URL`/`DIRECT_URL` của EduConnect trỏ về DB dùng chung; giới hạn kết nối cho từng app (`connection_limit`).
