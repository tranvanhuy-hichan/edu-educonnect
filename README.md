# EduConnect

**School management and digital learning in one platform.**  
**Nền tảng quản lý nhà trường và học tập số.**

[English](#english) · [Tiếng Việt](#tiếng-việt)

---

## English

### Overview

EduConnect is a web application for Vietnamese high schools, bringing academic administration, teaching, assessment, and school operations into a shared workspace. It supports administrators, school leaders, teachers, librarians, and students, with a separate parent lookup portal.

The application interface is primarily in Vietnamese. This repository uses npm workspaces, with the Next.js application located in `app/`.

### Key features

| Area | Capabilities |
| --- | --- |
| Academic administration | Academic years and terms, grades, classes, student and teacher records, class curricula, and teaching assignments. |
| Timetables | Automatic scheduling, fixed classrooms, configurable teaching sessions and fixed activities, weekly timetable versions, and Excel export. |
| Exam planning | Draft and published schedules, candidate grouping, room and invigilator allocation, seating lists, Excel export, and student calendar downloads. |
| Teaching and learning | Reusable lesson libraries, class lessons, assignments, attachments, and student submissions. |
| Questions and quizzes | Question banks, AI-assisted document import, randomized quizzes, attempt management, and secure exam workflows. |
| Assessment | Scores and comments, review and approval workflows, grade visibility, year-end results, and promotion decisions. |
| School operations | Class diaries, attendance, class competition tracking, library books and loans, notifications, and activity logs. |
| Access management | Multiple roles per account, role-specific navigation, and permissions scoped to classes and subjects. |

### Technology stack

| Layer | Technologies |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript |
| Styling and UI | Tailwind CSS 4, Lucide React, KaTeX |
| Database | PostgreSQL, Prisma ORM 6 |
| Authentication and validation | JWT, bcryptjs, Zod |
| File storage | Cloudinary or MinIO |
| AI import | Google Gemini, optional Anthropic Claude |
| Documents and exports | ExcelJS, JSZip, XML parsing |
| Quality checks | ESLint, TypeScript, Node.js test runner with tsx |

### Local development

**Prerequisites:** Node.js 20.9 or later, npm with workspace support, and a PostgreSQL database. Configure Cloudinary or MinIO to use file upload features; an AI provider key is required only for AI-assisted import.

Run the following commands from the repository root:

```bash
npm ci
cp app/.env.example app/.env
```

Edit `app/.env` with your database connections and a strong `JWT_SECRET`. `DATABASE_URL` is the application connection; `DIRECT_URL` must support Prisma migrations. A local PostgreSQL instance can use the same direct connection URL for both.

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

Open [localhost:3000](http://localhost:3000). Seeding loads demonstration data and accounts; use it with a development database. Account details are documented in [test accounts](docs/tai-khoan-test.json). Seed scripts may reset demo account passwords when rerun.

### Environment configuration

The complete template is [app/.env.example](app/.env.example). Keep actual credentials in `app/.env` and outside version control.

| Variables | Purpose |
| --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | PostgreSQL application and migration connections. |
| `JWT_SECRET` | Secret for signing authentication tokens. |
| `STORAGE_PROVIDER` | `cloudinary` (default) or `minio`. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Credentials for Cloudinary storage. |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_REGION` | MinIO connection and existing private bucket. |
| `UPLOAD_MAX_MB` | Upload size limit; defaults to 10 MB and cannot exceed 10 MB. |
| `NEXT_PUBLIC_APP_URL` | Public application URL for shared-link previews. |
| `GEMINI_API_KEY` | Enables Gemini-assisted question and exam import. |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY` | Select `anthropic` and supply a key to use Claude instead. |

### Development commands

Run these commands from the repository root unless stated otherwise.

| Command | Action |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Generate Prisma Client and build the production application. |
| `npm run start --workspace=app` | Start the production application after building. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Check TypeScript types. |
| `npm test` | Run unit tests (no database needed). |
| `npm run test:db --workspace=app` | Run integration tests; needs a seeded **disposable** PostgreSQL (see `make services`). |
| `npm run openapi` | Regenerate `docs/openapi.json` from the Zod schemas. |
| `make backup` | Encrypted `pg_dump` backup (see the operations guide). |
| `npm run prisma:migrate` | Apply or create migrations during development. |
| `npm run prisma:deploy` | Apply pending migrations during deployment. |
| `npm run prisma:status` | Inspect migration status. |
| `npm run seed` | Populate demonstration data. |

For example, run the scheduling tests from `app/`:

```bash
cd app
node --import tsx --test tests/auto-schedule.test.ts tests/timetable-versions.test.ts tests/schedule-options.test.ts
```

Database integration tests require `RUN_DATABASE_TESTS=1` and a configured, disposable test database. With `app/.env` pointing to that database, run:

```bash
RUN_DATABASE_TESTS=1 node --env-file=.env --import tsx --test tests/exam-planning.test.ts tests/exams.integration.test.ts
```

Some integration suites require seeded reference data. Check each suite's fixtures before running it.

### Project structure

```text
EduConnect/
├── app/
│   ├── prisma/             # Schema, migrations, and seed scripts
│   ├── src/
│   │   ├── app/            # Routes, pages, API handlers, and Server Actions
│   │   ├── components/     # Shared user interface components
│   │   ├── modules/        # Business modules, services, and repositories
│   │   ├── infrastructure/ # Database and transaction infrastructure
│   │   └── lib/            # Authentication, policies, storage, and utilities
│   ├── scripts/            # Operational and verification scripts
│   └── tests/              # Unit and integration tests
├── docs/                   # Requirements, architecture, and operational guides
├── Makefile                # Development shortcuts
└── package.json            # Workspace configuration and root commands
```

### Operations

Production observability and recovery are built in: structured JSON logs (pino) with a per-request `x-request-id`, persistent error grouping at `/van-hanh` (admin only) plus optional Sentry, `/api/health` and `/api/ready` probes, a database-backed job queue with retries, shared rate limiting, security headers (CSP, HSTS), generated OpenAPI docs (`/api/docs`), GitHub Actions CI, and a nightly encrypted backup that is restore-tested. See the [operations runbook](docs/van-hanh.md).

### Deployment and documentation

Production builds do **not** apply database migrations. Inspect migration status and apply pending migrations before releasing code that depends on schema changes:

```bash
npm run prisma:status
npm run prisma:deploy
npm run build
npm run start --workspace=app
```

For existing databases, review the [deployment guide](docs/trien-khai.md) first: it records migration-history and baseline considerations. Configure environment variables on the deployment platform and provision the selected storage provider separately.

Additional documentation is maintained in Vietnamese:

- [Requirements](docs/phan-tich-yeu-cau.md)
- [Architecture and layering](docs/kien-truc-phan-tang.md)
- [File storage](docs/luu-tru-tep.md)
- [Exam scheduling workflows](docs/lich-thi-nghiep-vu.md)
- [Operations runbook: logs, errors, backup and restore](docs/van-hanh.md)
- [Mobile interface](docs/giao-dien-mobile.md)
- [Detailed application workflows](app/README.md)

---

## Tiếng Việt

### Giới thiệu

EduConnect là ứng dụng web dành cho trường trung học phổ thông Việt Nam, kết nối quản lý đào tạo, giảng dạy, đánh giá và vận hành nhà trường trên cùng một nền tảng. Hệ thống phục vụ quản trị viên, ban giám hiệu, giáo viên, thủ thư và học sinh; đồng thời có cổng tra cứu riêng cho phụ huynh.

Giao diện ứng dụng chủ yếu sử dụng tiếng Việt. Repository tổ chức theo npm workspaces, với ứng dụng Next.js nằm trong thư mục `app/`.

### Chức năng chính

| Phân hệ | Chức năng |
| --- | --- |
| Quản lý đào tạo | Năm học, học kỳ, khối, lớp, hồ sơ học sinh và giáo viên, danh sách môn học của lớp, phân công giảng dạy. |
| Thời khóa biểu | Xếp lịch tự động, phòng cố định của lớp, cấu hình buổi học và hoạt động cố định, phiên bản áp dụng theo tuần, xuất Excel. |
| Lịch thi | Lập nháp và công bố lịch, chia thí sinh, phân phòng và giám thị, danh sách chỗ ngồi, xuất Excel và tải lịch cá nhân. |
| Giảng dạy và học tập | Kho bài học tái sử dụng, bài học theo lớp, giao bài tập, đính kèm tài liệu và nộp bài. |
| Câu hỏi và trắc nghiệm | Ngân hàng câu hỏi, nhập tài liệu có hỗ trợ AI, đảo đề, quản lý lượt làm bài và quy trình kiểm tra bảo mật. |
| Đánh giá | Điểm số, nhận xét, trình duyệt và phê duyệt, quyền xem điểm, tổng kết năm học và xét lên lớp. |
| Vận hành nhà trường | Sổ đầu bài, điểm danh, thi đua, quản lý sách và mượn trả, thông báo, nhật ký hoạt động. |
| Quản lý truy cập | Một tài khoản có nhiều vai trò, điều hướng theo vai trò, phân quyền theo lớp và môn học. |

### Công nghệ sử dụng

| Thành phần | Công nghệ |
| --- | --- |
| Ứng dụng | Next.js 16, React 19, TypeScript |
| Giao diện | Tailwind CSS 4, Lucide React, KaTeX |
| Cơ sở dữ liệu | PostgreSQL, Prisma ORM 6 |
| Xác thực và kiểm tra dữ liệu | JWT, bcryptjs, Zod |
| Lưu trữ tệp | Cloudinary hoặc MinIO |
| Nhập liệu bằng AI | Google Gemini, tùy chọn Anthropic Claude |
| Tài liệu và xuất dữ liệu | ExcelJS, JSZip, xử lý XML |
| Kiểm tra chất lượng | ESLint, TypeScript, Node.js test runner kết hợp tsx |

### Cài đặt và chạy cục bộ

**Yêu cầu:** Node.js từ 20.9, npm hỗ trợ workspaces và cơ sở dữ liệu PostgreSQL. Cần cấu hình Cloudinary hoặc MinIO để tải tệp lên; khóa API của nhà cung cấp AI chỉ cần cho chức năng nhập liệu bằng AI.

Chạy các lệnh sau tại thư mục gốc repository:

```bash
npm ci
cp app/.env.example app/.env
```

Cập nhật `app/.env` với kết nối cơ sở dữ liệu và `JWT_SECRET` đủ mạnh. `DATABASE_URL` phục vụ ứng dụng; `DIRECT_URL` cần hỗ trợ migration của Prisma. Với PostgreSQL cục bộ, có thể dùng cùng một URL kết nối trực tiếp cho cả hai biến.

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

Truy cập [localhost:3000](http://localhost:3000). Lệnh seed tạo dữ liệu và tài khoản minh họa, dành cho cơ sở dữ liệu phát triển. Xem thông tin đăng nhập tại [danh sách tài khoản thử nghiệm](docs/tai-khoan-test.json). Chạy lại seed có thể đặt lại mật khẩu tài khoản mẫu.

### Cấu hình môi trường

Mẫu cấu hình đầy đủ nằm tại [app/.env.example](app/.env.example). Lưu thông tin xác thực thực tế trong `app/.env`, không đưa vào quản lý phiên bản.

| Biến môi trường | Mục đích |
| --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | Kết nối PostgreSQL cho ứng dụng và migration. |
| `JWT_SECRET` | Khóa bí mật ký token xác thực. |
| `STORAGE_PROVIDER` | Chọn `cloudinary` (mặc định) hoặc `minio`. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Thông tin xác thực Cloudinary. |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_REGION` | Kết nối MinIO và bucket riêng tư đã tạo sẵn. |
| `UPLOAD_MAX_MB` | Giới hạn dung lượng tải lên; mặc định và tối đa 10 MB. |
| `NEXT_PUBLIC_APP_URL` | Địa chỉ công khai dùng cho ảnh xem trước khi chia sẻ liên kết. |
| `GEMINI_API_KEY` | Kích hoạt nhập câu hỏi và đề kiểm tra bằng Gemini. |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY` | Đặt nhà cung cấp là `anthropic` và bổ sung khóa để dùng Claude. |

### Các lệnh phát triển

Các lệnh dưới đây chạy tại thư mục gốc, trừ khi có hướng dẫn khác.

| Lệnh | Công dụng |
| --- | --- |
| `npm run dev` | Khởi động máy chủ phát triển. |
| `npm run build` | Sinh Prisma Client và tạo bản build production. |
| `npm run start --workspace=app` | Chạy ứng dụng production sau khi build. |
| `npm run lint --workspace=app` | Kiểm tra ESLint. |
| `npm exec --workspace=app -- tsc --noEmit` | Kiểm tra kiểu TypeScript. |
| `npm run prisma:migrate` | Áp dụng hoặc tạo migration khi phát triển. |
| `npm run prisma:deploy` | Áp dụng migration đang chờ khi triển khai. |
| `npm run prisma:status` | Kiểm tra trạng thái migration. |
| `npm run seed` | Tạo dữ liệu minh họa. |

Ví dụ chạy nhóm kiểm thử thời khóa biểu trong `app/`:

```bash
cd app
node --import tsx --test tests/auto-schedule.test.ts tests/timetable-versions.test.ts tests/schedule-options.test.ts
```

Kiểm thử tích hợp cơ sở dữ liệu yêu cầu `RUN_DATABASE_TESTS=1` và một database thử nghiệm riêng, có thể xóa sau khi dùng. Sau khi cấu hình `app/.env` trỏ tới database này, chạy:

```bash
RUN_DATABASE_TESTS=1 node --env-file=.env --import tsx --test tests/exam-planning.test.ts tests/exams.integration.test.ts
```

Một số nhóm kiểm thử cần dữ liệu danh mục đã seed. Kiểm tra fixture của từng nhóm trước khi chạy.

### Cấu trúc dự án

```text
EduConnect/
├── app/
│   ├── prisma/             # Schema, migration và dữ liệu khởi tạo
│   ├── src/
│   │   ├── app/            # Định tuyến, trang, API và Server Actions
│   │   ├── components/     # Thành phần giao diện dùng chung
│   │   ├── modules/        # Module nghiệp vụ, service và repository
│   │   ├── infrastructure/ # Hạ tầng cơ sở dữ liệu và giao dịch
│   │   └── lib/            # Xác thực, chính sách, lưu trữ và tiện ích
│   ├── scripts/            # Script vận hành và kiểm chứng
│   └── tests/              # Kiểm thử đơn vị và tích hợp
├── docs/                   # Yêu cầu, kiến trúc và hướng dẫn vận hành
├── Makefile                # Lệnh tắt cho môi trường phát triển
└── package.json            # Cấu hình workspace và lệnh tại thư mục gốc
```

### Vận hành

Hệ thống có sẵn khả năng quan sát và phục hồi cho production: log JSON có cấu trúc (pino) kèm `x-request-id` cho từng yêu cầu, gom lỗi bền vững tại `/van-hanh` (chỉ ADMIN) cùng Sentry tuỳ chọn, endpoint `/api/health` và `/api/ready`, hàng đợi tác vụ nền trong DB có thử lại, giới hạn tốc độ dùng chung, header bảo mật (CSP, HSTS), tài liệu OpenAPI tự sinh (`/api/docs`), CI bằng GitHub Actions và sao lưu mã hoá hằng đêm có khôi phục thử. Xem [hướng dẫn vận hành](docs/van-hanh.md).

### Triển khai và tài liệu

Build production **không** tự áp dụng migration. Kiểm tra trạng thái và áp dụng migration trước khi phát hành mã nguồn phụ thuộc vào cấu trúc dữ liệu mới:

```bash
npm run prisma:status
npm run prisma:deploy
npm run build
npm run start --workspace=app
```

Với database đã có dữ liệu, đọc [hướng dẫn triển khai](docs/trien-khai.md) trước để đối chiếu lịch sử migration và các lưu ý về baseline. Khai báo biến môi trường trên nền tảng triển khai và thiết lập riêng dịch vụ lưu trữ đã chọn.

Tài liệu tham khảo:

- [Phân tích yêu cầu](docs/phan-tich-yeu-cau.md)
- [Kiến trúc và phân tầng](docs/kien-truc-phan-tang.md)
- [Lưu trữ tệp](docs/luu-tru-tep.md)
- [Nghiệp vụ lịch thi](docs/lich-thi-nghiep-vu.md)
- [Hướng dẫn vận hành: log, lỗi, sao lưu và khôi phục](docs/van-hanh.md)
- [Giao diện trên thiết bị di động](docs/giao-dien-mobile.md)
- [Hướng dẫn nghiệp vụ chi tiết](app/README.md)
