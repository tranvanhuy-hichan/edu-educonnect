# Chuẩn phân tầng TypeScript của EduConnect

Ngày đánh giá: 10/11/2026. Đây là kết quả rà soát và chuẩn đích; chưa phải xác nhận mã hiện tại đã được refactor toàn bộ.

## Rà soát ban đầu (trước refactor)

Mã đã chia domain trong `src/modules`, có nhiều cặp service/repository và Zod schema. Tuy nhiên vẫn có truy cập DB và quy tắc nghiệp vụ nằm ngoài tầng đúng trách nhiệm.

Thống kê theo dấu hiệu `db.`/`prisma.` trong mã nguồn hiện tại, không thay thế kiểm tra AST:

| Nhóm | File truy cập DB trực tiếp / tổng file nhóm |
| --- | --- |
| Server Actions | 18 / 21 |
| API routes | 2 / 6 |
| Pages | 36 / 44 |
| Service trong modules | 7 / 13 |
| src/server | 4 / 4 |

Chỉ số này còn chưa đếm hết các truy cập qua `tx.*`. Đếm tên thư mục hoặc phần mở rộng `.service.ts` không đủ để kết luận đã phân tầng.

## Phần đã refactor

- Repository đảm nhiệm truy vấn trong toàn bộ các file `*.service.ts` / `service.ts` thuộc modules.
- Điểm số, nhận xét, mở khóa điểm, xét kết quả, chuyển lớp, chương trình lớp, lịch thi và thời khóa biểu sử dụng transaction context không chứa Prisma model. Repository nhận context để cùng tham gia giao dịch.
- Actions nhập điểm, mở khóa/nhận xét, xét lên lớp, giáo án và bài học gọi use case; các route upload/download gọi service tệp.
- Service tệp kiểm tra quyền, điều phối cloud, lưu metadata và xóa đối tượng nếu ghi DB thất bại. Component đính kèm lấy tên tệp qua service.
- Xác thực danh tính và phân quyền lớp/môn truy vấn qua repository auth; notification và content service không truy cập Prisma trực tiếp.
- ESLint ngăn service import Prisma client kết nối, Next.js hoặc API lấy ORM từ transaction; các controller vừa tách được chặn import DB/repository trực tiếp.

### Phần còn cần chuyển đổi

Đây chưa phải refactor toàn ứng dụng. Các page đọc dữ liệu, action quản trị danh mục/tài khoản, cổng phụ huynh, thư viện và helper `src/server/*` vẫn còn truy cập DB trực tiếp. Quy tắc ESLint controller hiện áp dụng cho danh sách file đã chuyển đổi, chưa áp dụng toàn bộ `src/app`.

Bước tiếp theo là tạo read service có DTO theo từng màn hình, chuyển các action quản trị sang use case và mở rộng quy tắc lint tương ứng. Không tạo repository tổng quát trả lại Prisma client để che truy vấn trong UI.

### Kiểm chứng

TypeScript, ESLint và production build được kiểm tra cho đợt refactor. Bộ kiểm thử tích hợp dùng PostgreSQL tạm, không dùng DB trong `.env`. Sau khi sửa fixture ca học và bổ sung kiểm thử giữ đúng ca: toàn bộ 48/48 ca đạt, không bỏ qua ca tích hợp. Đầu vào thuật toán bắt buộc khai báo `shift`; ca kiểm tra trùng giáo viên dùng hai lớp cùng ca. Kiểm thử tệp còn kiểm tra sửa/xóa nội dung và từ chối học sinh thao tác quản lý.

## Luồng phụ thuộc bắt buộc

UI → controller/adapter Next.js → application service → repository → PostgreSQL.

Service → storage adapter → Cloudinary / MinIO.

Không gọi ngược từ repository sang service; không để service phụ thuộc HTTP, JSX hoặc điều hướng Next.js.

## Trách nhiệm

| Tầng | Được làm | Không được làm |
| --- | --- | --- |
| UI | Render DTO, trạng thái form, tương tác và điều hướng trình duyệt | Import Prisma, gọi repository, quyết định quyền hoặc kết quả nghiệp vụ chính thức |
| Controller | Lấy session, parse FormData/JSON/query/params, gọi use case, map lỗi, response/redirect/revalidate | CRUD DB, tính điểm/xét lên lớp, quyết định quyền theo hồ sơ, gọi SDK cloud trực tiếp |
| Service | Kiểm tra quyền theo đối tượng, quy tắc, trạng thái, tính toán, điều phối nhiều repository/tác vụ | `NextRequest`, `NextResponse`, cookies, redirect, revalidate, JSX, truy vấn Prisma |
| Repository | Đọc/ghi/khóa hàng, truy vấn tổng hợp, ánh xạ dữ liệu lưu trữ | Phê duyệt, xét điều kiện lên lớp, chọn quyền người dùng, điều hướng |
| Domain/policy | Hàm thuần cho công thức, điều kiện, trạng thái và chính sách | I/O hoặc phụ thuộc Next/Prisma/cloud |
| Infrastructure | Prisma client, transaction manager, SDK cloud và cấu hình kỹ thuật | Quyết định học sinh/giáo viên nào có quyền thao tác |

Lấy session ở controller không thay thế kiểm tra quyền trong service. Ví dụ service vẫn phải xác nhận GVCN phụ trách đúng học sinh của đúng năm học.

## Áp dụng trong Next.js

- `app/api/**/route.ts`: đã là HTTP controller; không cần tạo thêm class controller chỉ để chuyển tiếp một hàm.
- `app/**/actions.ts`: controller cho thao tác form, trả kết quả cho UI và thực hiện revalidate/redirect sau khi service hoàn tất.
- `page.tsx`: render/composition; lấy dữ liệu thông qua service đọc trả về view model/DTO. Không nhét truy vấn và tính toán nghiệp vụ vào JSX.
- Khi một use case có nhiều loại đầu vào, có thể thêm `<domain>.controller.ts` hoặc adapter chung để map input/output; không bắt buộc mọi module phải có file controller riêng.
- Tránh Server Component gọi HTTP tới chính API của ứng dụng chỉ để lấy lại dữ liệu server đã có thể lấy qua service.

Tách trách nhiệm mã không đòi hỏi đổi framework hoặc tách deployment ngay. Nếu tiếp tục yêu cầu tách backend/frontend thành ứng dụng riêng theo tài liệu gốc, có thể thực hiện sau khi ranh giới module được làm rõ.

## Cấu trúc đích

```text
src/
  app/                            # UI, Route Handlers, Server Actions mỏng
  components/                     # UI nhận DTO
  modules/
    scoring/
      scoring.schema.ts           # Hợp đồng input/output
      scoring.types.ts            # DTO và kiểu nghiệp vụ
      scoring.service.ts          # Use cases tính/lưu điểm
      scoring-query.service.ts    # Use cases đọc, quyền và view model nếu cần
      scoring.repository.ts       # Mọi truy vấn điểm số
      scoring.policy.ts           # Khóa sổ, quy tắc cập nhật
      annual.ts                   # Công thức thuần
    files/
      files.schema.ts
      files.types.ts
      files.service.ts            # Upload/download, phạm vi tài liệu và bù trừ lỗi
      files.repository.ts         # StoredFile và truy vấn tham chiếu
    promotion/                    # Cùng quy ước
    ...
  infrastructure/
    database/
      client.ts
      unit-of-work.ts
    storage/
      cloudinary.adapter.ts
      minio.adapter.ts
      storage.factory.ts
  shared/
    errors.ts                     # Lỗi độc lập framework
```

Không tạo generic repository để bọc toàn bộ Prisma rồi cho service dùng `repo.client.*`; cách đó vẫn để truy vấn DB ở service. Repository nên cung cấp thao tác có nghĩa, ví dụ `findEnrollmentForYear`, `findPendingUnlock`, `replaceStudentScores`, `appendScoreAudit`.

## Giao dịch và tác vụ ngoài DB

Service quyết định những thao tác nào cần nguyên tử. Unit of Work mở giao dịch và cấp các repository cùng transaction context cho callback. SQL và khóa hàng nằm trong repository; service không tự viết SQL hoặc gọi `tx.model.*`.

Với lưu tệp, upload cloud và ghi DB không phải một giao dịch ACID. Service phải điều phối và bù trừ: upload → lưu metadata; lưu metadata thất bại → yêu cầu adapter xóa đối tượng vừa tạo. Controller chỉ trả mã HTTP phù hợp.

Các thao tác công bố, duyệt, chuyển lớp, khóa/mở quyền sửa và nhật ký liên quan phải được giữ cùng giao dịch phù hợp khi refactor; không được tách ra thành nhiều lần ghi rời rạc chỉ để làm đẹp cấu trúc.

## Thứ tự chuẩn hóa

1. Điểm số, phê duyệt/mở quyền sửa, tổng kết và xét lên lớp: đang có nghiệp vụ nhạy cảm và nhiều truy vấn trộn trong actions.
2. Tệp/học liệu: tách StoredFile repository, file service và storage adapters; giữ API upload/download mỏng.
3. Học sinh, ghi danh, chuyển lớp, phụ huynh và phân quyền.
4. TKB, phiên bản và lịch thi: bảo toàn khóa giao dịch, lịch sử và kiểm tra xung đột.
5. Thư viện, thông báo, cấu hình và các truy vấn phục vụ dashboard/báo cáo.

Mỗi module chuyển xong cần kiểm thử và cập nhật mọi nơi gọi trước khi chuyển tiếp. Không đổi tên thư mục hàng loạt rồi coi như đã hoàn thành kiến trúc.

## Tiêu chí kiểm chứng

- Không còn import DB/Prisma runtime trong page, component, actions và routes của module đã chuẩn hóa.
- Service không gọi model Prisma, raw SQL, Next API hoặc SDK cloud trực tiếp.
- Quyền theo đối tượng và quy tắc trạng thái có test ở service/policy; gọi use case ngoài controller vẫn không vượt quyền.
- Repository có integration test trên PostgreSQL cho constraint, khóa và rollback; không chỉ mock CRUD.
- Controller có test parse input, mã lỗi/response và điều hướng; UI không chứa kết luận nghiệp vụ chính thức.
- Có rule ESLint/kiểm tra kiến trúc CI chặn import vượt tầng. Chỉ bật mức error cho phạm vi đã chuyển xong; tồn đọng phải được liệt kê, không dùng disable hàng loạt để che lỗi.
- Không để DTO công khai phụ thuộc vào Prisma include/select hoặc trả passwordHash/token/khóa cloud.
