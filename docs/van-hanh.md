# Vận hành EduConnect trên production

Tài liệu dành cho người trực hệ thống: **theo dõi log, tìm và sửa lỗi, sao lưu và khôi phục**. Mọi lệnh chạy từ thư mục gốc repository.

## 1. Bức tranh tổng thể

```
Người dùng ──► Vercel (Next.js) ──► PostgreSQL (Supabase)
                 │  ├─ log JSON (pino) ──► Vercel Logs ──► Log Drain (Axiom / Better Stack)
                 │  ├─ lỗi ──► bảng ErrorLog  (trang /van-hanh)  +  Sentry (tuỳ chọn)
                 │  └─ việc nền ──► bảng Job  ──► /api/jobs/run (cron + after())
                 └─ kho tệp: Cloudinary hoặc MinIO
Giám sát ngoài (UptimeRobot/Better Stack) ──► /api/health , /api/ready
GitHub Actions: CI mỗi PR · backup hằng đêm (mã hoá + khôi phục thử) · migrate production (chạy tay)
```

Nguyên tắc: **mỗi sự cố phải truy ra được từ một mã** (`requestId`/mã lỗi người dùng nhìn thấy) đến đúng dòng log, đúng lỗi, đúng bản phát hành.

## 2. Thiết lập một lần

### Biến môi trường (Vercel → Settings → Environment Variables)
| Biến | Bắt buộc | Mục đích |
| --- | --- | --- |
| `CRON_SECRET` | **Có** | ≥ 16 ký tự ngẫu nhiên. Vercel tự gửi làm `Authorization: Bearer` cho cron. Thiếu → `/api/jobs/run` từ chối mọi yêu cầu, việc nền chỉ chạy qua `after()`. |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Khuyến nghị | Gom lỗi, nhóm theo bản phát hành, gửi cảnh báo email/Slack. Để trống = tắt. |
| `HEALTH_TOKEN` | Tuỳ chọn | Cho phép xem chi tiết `/api/ready` bằng header `x-health-token`. |
| `LOG_LEVEL`, `SLOW_QUERY_MS` | Tuỳ chọn | Mức log; ngưỡng truy vấn chậm (mặc định 500 ms). |

Khi đổi `NEXT_PUBLIC_*` phải build/deploy lại.

### Log bền vững (bắt buộc nếu cần tra log cũ)
Log Vercel chỉ giữ ngắn (Hobby ~1 giờ, Pro ~1 ngày). Vào **Vercel → Settings → Log Drains** (hoặc Integrations) nối sang **Axiom** hoặc **Better Stack** (đều có gói miễn phí). Log là JSON một dòng nên lọc được theo trường: `level`, `requestId`, `path`, `status`, `ms`, `userId`, `jobType`.

### Giám sát và cảnh báo
- **UptimeRobot / Better Stack Uptime** (miễn phí): kiểm tra mỗi 1–5 phút
  - `GET /api/health` → 200 (tiến trình sống)
  - `GET /api/ready` → 200 (DB trả lời, không migration dang dở, kho tệp có cấu hình). `503` = có thành phần hỏng → báo ngay cho người trực.
- **Sentry**: tạo alert “issue mới” và “tăng đột biến”. Gắn release tự động nhờ `VERCEL_GIT_COMMIT_SHA`.
- **Supabase** → Reports: theo dõi CPU/kết nối/dung lượng DB; đặt cảnh báo khi dung lượng > 80%.

### Secrets cho GitHub Actions (Settings → Secrets and variables → Actions, environment `production`)
| Secret | Dùng cho |
| --- | --- |
| `PROD_DIRECT_URL` | Kết nối **trực tiếp** (cổng 5432, không phải pooler 6543) cho backup/migrate |
| `BACKUP_PASSPHRASE` | Mã hoá backup (≥ 24 ký tự). **Cất bản sao ở trình quản lý mật khẩu — mất nó là mất mọi backup.** |
| `BACKUP_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `BACKUP_S3_ENDPOINT` | Lưu backup ra ngoài GitHub (R2/B2/S3/MinIO). Khuyến nghị bật. |

Bật **Required reviewers** cho environment `production` để việc migrate production cần người duyệt.

## 3. Khi có sự cố: quy trình tìm lỗi

1. **Người dùng báo lỗi** kèm “Mã lỗi” (trang lỗi) hoặc “Mã tham chiếu” (thông báo form) hoặc `requestId` (phản hồi API 500, header `x-request-id`).
2. Vào **/van-hanh → Lỗi hệ thống**: thấy lỗi nào, xảy ra ở route nào, bao nhiêu lần, lần cuối khi nào, kèm stack.
3. Cần ngữ cảnh đầy đủ → tìm trong Log Drain: `requestId:"<mã>"`. Một request gồm: dòng `http_request` (status, `ms`), các dòng `slow_query`, `unhandled_error`.
4. Có Sentry → mở issue cùng `request_id` tag: có stack, breadcrumbs, bản phát hành, tần suất.
5. Sửa lỗi → deploy → bấm **“Đã xử lý”** trên /van-hanh. Lỗi tái phát tự mở lại và tăng số lần, nên “đã xử lý” mà vẫn thấy lại nghĩa là chưa hết.

Các dấu hiệu thường gặp:
| Triệu chứng | Nghĩa là | Việc cần làm |
| --- | --- | --- |
| `/api/ready` 503, `database.ok=false` | DB không phản hồi | Kiểm tra Supabase status, giới hạn kết nối; xem log `readiness_check_failed` |
| Lỗi Prisma `P2022` / “column does not exist” | Deploy code trước khi migrate DB | Chạy migration (mục 6). Đừng thêm cột lẻ bằng tay |
| Nhiều dòng `slow_query` cùng câu SQL | Thiếu chỉ mục / truy vấn nặng | `npm run ops:explain --workspace=app` trên bản khôi phục dữ liệu thật |
| Tác vụ nhập AI kẹt “Đang chờ” | Worker không chạy | /van-hanh → “Chạy hàng đợi ngay”; kiểm tra `CRON_SECRET` |
| HTTP 429 | Chạm giới hạn tốc độ (tải tệp 30/phút, nhập AI 5/10 phút, đổi mật khẩu 5/15 phút) | Bình thường với người bấm liên tục; chỉnh `LIMITS` trong `app/src/lib/rate-limit.ts` nếu quá chặt |

## 4. Hàng đợi tác vụ nền

- Việc ghi vào bảng `Job` (bền vững), worker nhận việc bằng `FOR UPDATE SKIP LOCKED` nên nhiều instance không làm trùng.
- Ba đường kích hoạt: `after()` ngay sau khi tạo việc; cron `/api/jobs/run` (lưới an toàn, nhặt lại việc bị bỏ dở quá 6 phút); nút **Chạy hàng đợi ngay** ở /van-hanh.
- Việc lỗi tự thử lại với độ trễ tăng dần (30s, 60s…) đến `maxAttempts`, sau đó `FAILED` và xuất hiện trong danh sách lỗi; bấm **Thử lại** để xếp lại.
- Cron mặc định chạy 1 lần/ngày (tương thích gói Vercel Hobby, kèm dọn dẹp). Gói Pro: đổi `schedule` trong `vercel.json` thành `*/5 * * * *` để lưới an toàn nhặt việc nhanh hơn. Gói Hobby: dùng UptimeRobot gọi `/api/jobs/run` (header Authorization) mỗi 5 phút.
- Thêm loại việc mới: `registerJob("ten.viec", handler)` trong `app/src/lib/jobs/handlers.ts`, rồi `enqueue("ten.viec", payload, { dedupeKey })`.

## 5. Sao lưu và khôi phục

### Ba lớp bảo vệ
| Lớp | Nội dung | Khôi phục tối đa về | Ghi chú |
| --- | --- | --- | --- |
| 1. Backup của nhà cung cấp DB | Supabase daily backup / PITR | PITR: từng giây (gói Pro trở lên, bật add-on) | Phản ứng nhanh nhất; phụ thuộc gói dịch vụ |
| 2. Workflow `Backup database` | `pg_dump` mã hoá AES-256 hằng đêm 03:00 (giờ VN), **khôi phục thử** vào DB tạm mỗi lần | 24 giờ | Độc lập nhà cung cấp; GitHub giữ 30 ngày, S3 giữ lâu hơn |
| 3. Sao lưu thủ công trước thay đổi lớn | `make backup` / workflow `Database migrate` | Thời điểm bấm | Luôn làm trước migrate, lên lớp, nhập dữ liệu hàng loạt |

Mục tiêu đề xuất: **RPO ≤ 24 giờ** (mất tối đa 1 ngày dữ liệu; PITR đưa xuống vài phút), **RTO ≤ 2 giờ**. Điều chỉnh theo yêu cầu của trường.

**Tệp tải lên** (Cloudinary/MinIO) *không* nằm trong `pg_dump`. Cloudinary: bật Backup trong cài đặt tài khoản. MinIO: `mc mirror minio/educonnect <nơi-khác>` định kỳ, hoặc bật bucket versioning + replication.

### Sao lưu thủ công
```sh
export PGURL="postgresql://…:5432/postgres"        # kết nối trực tiếp, không pooler
export BACKUP_PASSPHRASE="…"                       # giống secret trên GitHub
make backup                                        # → backups/educonnect-<UTC>.dump.enc (+ .sha256), giữ 14 bản
```
Script từ chối pooler, từ chối passphrase ngắn, xoá bản chưa mã hoá kể cả khi lỗi, và chạy `pg_restore --list` để chắc file đọc được. Thêm `--verify <URL DB trống>` để khôi phục thử ngay.

### Khôi phục
1. **Dừng ghi** nếu khôi phục đè lên DB đang chạy (bật bảo trì hoặc tạm vô hiệu hoá deploy).
2. Tải bản backup (artifact GitHub hoặc S3) + file `.sha256` về cùng thư mục.
3. Khôi phục vào **DB mới/trống trước** để kiểm tra:
   ```sh
   export BACKUP_PASSPHRASE="…"
   scripts/ops/restore.sh backups/educonnect-….dump.enc "postgresql://…/db_moi"
   ```
   Script kiểm tra checksum, từ chối ghi đè DB có dữ liệu trừ khi thêm `--confirm-production` (khi đó chờ 10 giây rồi `--clean --if-exists`).
4. Kiểm tra: `npm run prisma:status`, `GET /api/ready`, đăng nhập thử bằng một tài khoản quản trị, mở một bảng điểm.
5. Chuyển `DATABASE_URL`/`DIRECT_URL` sang DB mới (hoặc đã khôi phục đè) và deploy lại. Ghi lại sự cố: nguyên nhân, thời điểm, dữ liệu mất.

Phiên bản PostgreSQL của DB đích phải **≥** phiên bản `pg_dump` đã tạo bản sao (workflow dùng 17).

### Diễn tập (mỗi quý một lần)
Khôi phục bản backup mới nhất vào DB trống, đăng nhập thử, ghi lại thời gian thực tế so với RTO. Backup chưa từng khôi phục thử thì chưa phải là backup. Workflow hằng đêm đã tự kiểm tra tối thiểu (DB khôi phục được và có tài khoản); diễn tập kiểm tra cả quy trình con người.

## 6. Phát hành và migration

1. Mở PR → CI chạy: `lint`, `typecheck`, unit test, build, **integration test trên PostgreSQL thật**, kiểm tra `docs/openapi.json` không lệch mã.
2. Merge vào `main` → Vercel build.
3. **Nếu PR có migration**: trước khi chuyển traffic, chạy workflow **Database migrate (production)**: để trống ô `apply` để xem trạng thái; gõ `apply` để sao lưu + áp dụng. Không bao giờ dùng `migrate reset` hay `db push` lên production.
4. Sau deploy: kiểm tra `/api/ready`, `/van-hanh` (không có lỗi mới), Sentry (release mới không có spike).
5. Hồi phục nhanh: Vercel → Deployments → *Promote* bản trước. Migration đã chạy thì phải tương thích ngược (thêm cột, không xoá cột trong cùng một đợt).

> **Tồn đọng đã biết:** chuỗi migration hiện không dựng được DB trống (cột `AssignmentSubmission.isLate/autoSubmitted` từng được thêm bằng `db push`, chưa có migration), và DB production Sơn Hà chưa có lịch sử migration (xem `docs/trien-khai.md`). Cần một đợt *baseline* riêng. Cho đến lúc đó CI dựng DB test bằng `prisma db push`, và job `migration-chain` chỉ cảnh báo.

## 7. Bảo mật đã bật sẵn
- Header: CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Thử chính sách mới an toàn bằng `CSP_REPORT_ONLY=1`.
- Giới hạn tốc độ dùng chung giữa các instance (PostgreSQL), định danh được băm.
- Log tự che `password`, `token`, `cookie`, `authorization`; log truy vấn chậm không kèm tham số; Sentry không gửi PII.
- `/api/docs`, `/api/openapi.json`, `/van-hanh` chỉ dành cho ADMIN. `/api/jobs/run` chỉ nhận `CRON_SECRET` (so sánh hằng thời gian).

## 8. Chạy cục bộ giống production
```sh
make services            # PostgreSQL 17 + MinIO bằng Docker
make setup && make dev
make check               # lint + typecheck + unit test như CI
```
