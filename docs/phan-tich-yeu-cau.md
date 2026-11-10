# EduConnect — Phân tích yêu cầu & đề xuất thiết kế (v3 — Next.js + Prisma)

> **Thay đổi so với bản v2**: v2 chọn Frappe Framework làm backend cho quy mô toàn trường. Khi triển khai thực tế, Frappe gặp nhiều trục trặc hạ tầng (môi trường Python hỏng, xung đột với các app khác dùng chung bench, vận hành phức tạp) và không deploy được lên Vercel free tier như mong muốn. User chốt **quay lại Next.js + Prisma + PostgreSQL** cho toàn bộ stack (giống 2 repo tham khảo ban đầu), đổi lại **yêu cầu rõ ràng về chất lượng kiến trúc mã nguồn**: phân tầng tốt, dễ đọc, dễ mở rộng, tách riêng `backend/` và `frontend/`. Toàn bộ nghiệp vụ, module, phân quyền đã chốt ở v2 **giữ nguyên** — chỉ đổi phần kiến trúc kỹ thuật và mô hình dữ liệu.

## 1. Bối cảnh & mục tiêu

Gom toàn bộ công tác quản lý trường học vào **một nơi duy nhất** để tiện theo dõi: tổ chức (học sinh, lớp, phòng học, giáo viên, năm học/học kỳ), vận hành (TKB, lịch dạy), học tập (môn học, bài giảng, bài tập, giáo án, điểm số, sổ đầu bài), thi đua cấp lớp, lên lớp cuối năm, và thư viện — cho **THPT Sơn Hà**, phạm vi 1 trường, không multi-tenant.

Phân quyền phải phản ánh đúng cấp bậc quản lý thực tế của trường học Việt Nam: Hiệu trưởng → Hiệu phó → GVCN → GVBM → Học sinh/Phụ huynh.

## 2. Đối tượng người dùng & phân cấp quyền

| Vai trò (enum `Role`) | Phạm vi | Quyền chính |
|---|---|---|
| **Hiệu trưởng** (`PRINCIPAL`) | Toàn trường | Toàn quyền: tổ chức, nhân sự, học kỳ, duyệt lên lớp, xem mọi báo cáo/thi đua, cấu hình hệ thống |
| **Hiệu phó** (`VICE_PRINCIPAL`) | Toàn trường (có thể giới hạn mảng phụ trách: chuyên môn/nề nếp) | Gần như Hiệu trưởng, trừ các thao tác cấu hình gốc (xóa năm học, phân quyền Hiệu trưởng) |
| **GVCN** (`HOMEROOM_TEACHER`) | 1 lớp | Quản lý danh sách HS của lớp, xem tổng hợp điểm + thi đua + sổ đầu bài của lớp, xác nhận kết quả lên lớp của từng HS |
| **GVBM** (`SUBJECT_TEACHER`) | Các lớp-môn được phân công | Đăng bài học/bài tập/giáo án trong môn mình dạy, nhập điểm, ghi nhận sổ đầu bài cho tiết mình dạy |
| **Thủ thư** (`LIBRARIAN`) | Thư viện | Quản lý đầu sách, số lượng, cho mượn/trả, theo dõi hạn trả — độc lập với học vụ |
| **Học sinh** (`STUDENT`) | Bản thân | Xem bài học/bài tập/giáo án, nộp bài, xem điểm + sổ đầu bài + thi đua lớp, xem TKB, mượn sách |
| *(Giai đoạn sau)* **Phụ huynh** (`GUARDIAN`) | Con của mình | Xem điểm, bài tập, nhận xét sổ đầu bài, TKB của con — read-only |

**Cơ chế phân quyền (tự viết, không còn Frappe RBAC có sẵn)**:

1. **Model `User`** có field `roles: Role[]` (1 người có thể giữ nhiều vai trò cùng lúc, vd vừa GVCN vừa GVBM 1 môn — đúng thực tế).
2. **RBAC theo scope**: quyền không chỉ dựa vào Role mà còn phải khớp **phạm vi dữ liệu** (vd GVCN chỉ thao tác được `SchoolClass` mà mình là `homeroomTeacherId`; GVBM chỉ thao tác được `ClassSubjectAssignment` mà mình là `teacherId`). Viết hàm kiểm tra tập trung, ví dụ:
   ```ts
   // backend/src/lib/auth/permission.ts
   async function canManageClassSubject(user: SessionUser, classSubjectAssignmentId: string): Promise<boolean>
   async function canViewStudent(user: SessionUser, studentId: string): Promise<boolean>
   ```
   Mọi Server Action/Route Handler **bắt buộc gọi hàm permission tương ứng trước khi đọc/ghi dữ liệu** — không tin tưởng kiểm tra phía client.
3. **Middleware** (`backend/src/middleware.ts` hoặc tương đương) chặn truy cập route theo Role ở lớp ngoài (UX: redirect sớm), nhưng đây chỉ là lớp UX — nguồn sự thật về quyền luôn nằm trong lớp `service` ở server.
4. Không cần bảng `Role`/`Permission` riêng trong DB cho giai đoạn này (enum đủ dùng cho 6 vai trò cố định); nếu sau này cần phân quyền tùy biến (custom role), có thể nâng cấp sang bảng `Role`/`Permission` động mà không phá vỡ interface của lớp permission.

## 3. Module / chức năng

### (a) Tổ chức & nhân sự
- **Năm học** (`AcademicYear`) → **Học kỳ** (`AcademicTerm`, thuộc 1 năm học).
- **Khối** (`GradeLevel`) → **Lớp** (`SchoolClass`, thuộc 1 khối + 1 năm học, có GVCN).
- **Phòng học** (`Room`): loại phòng (thường/thí nghiệm/máy tính...), sức chứa — dùng làm ràng buộc khi xếp TKB.
- **Giáo viên** (`Teacher`, liên kết `User`), **Học sinh** (`Student`, liên kết `User` + thông tin phụ huynh).
- **Phân lớp học sinh theo năm** (`StudentClassEnrollment`): (student, schoolClass, academicYear) — vì mỗi năm học sinh thuộc 1 lớp khác nhau, không gắn cứng student→class.

### (b) Học tập
- **Môn học** (`Subject`): danh mục môn dùng chung toàn trường (Toán, Văn...), có số tiết chuẩn/tuần theo khối.
- **Phân công giảng dạy** (`ClassSubjectAssignment`): (schoolClass, subject, teacher, academicTerm) — môn nào trong lớp nào do GV nào dạy, đổi được theo từng học kỳ.
- **Bài học/Bài tập** (`LessonPost`): gắn với `ClassSubjectAssignment`, có loại (bài học thường / bài tập), nội dung, đính kèm, hạn nộp (nếu là bài tập), cờ `quizMode` nếu là bài tập trắc nghiệm.
- **Câu hỏi trắc nghiệm** (`Question`, `QuestionOption`): dùng khi `LessonPost.quizMode = true` — đáp án đúng lưu sẵn để hệ thống tự chấm.
- **Nộp bài** (`AssignmentSubmission`): học sinh nộp file/text (tự luận) hoặc chọn đáp án (`StudentAnswer`, trắc nghiệm). Tự luận: GVBM chấm điểm/nhận xét bằng tay. Trắc nghiệm: hệ thống **tự động chấm** bằng cách so khớp `StudentAnswer` với đáp án đúng trong `QuestionOption`, tính điểm ngay khi nộp.
- **Theo dõi xem bài** (`LessonPostView`): (lessonPost, student, viewedAt) — ghi nhận từng học sinh đã xem, không chỉ đếm lượt.
- **Giáo án** (`LessonPlan`): tài liệu soạn giảng chi tiết của GVBM, khác bài học/bài tập — HS xem được (có thể giới hạn chỉ xem, không tải).
- **Cấu hình hệ số điểm** (`ScoreWeightConfig`): hệ số TX/GK/CK theo từng học kỳ, **Admin (Hiệu trưởng) cấu hình được qua UI, không hardcode trong code**.
- **Điểm số** (`ScoreEntry`): (student, classSubjectAssignment, academicTerm, scoreType: THUONG_XUYEN/GIUA_KY/CUOI_KY, value). Điểm trung bình môn (`SubjectTermAverage`) do hệ thống **tự tính** theo hệ số lấy từ `ScoreWeightConfig` của học kỳ tương ứng (xem Rủi ro #1).
- **Sổ đầu bài** (`ClassPeriodLog`): (schoolClass, classSubjectAssignment, tiết học thực tế theo TKB, ngày, giáo viên dạy, nhận xét nền nếp, xếp loại tiết, sĩ số vắng) — mỗi tiết dạy thực tế theo TKB sinh ra 1 bản ghi để GV đánh giá.

### (c) Vận hành
- **Thời khóa biểu** (`TimetableSlot`): (schoolClass, classSubjectAssignment, room, dayOfWeek, periodNo/giờ bắt đầu-kết thúc, academicTerm).
- **Sinh TKB tự động**: thuật toán xếp lịch có ràng buộc (constraint satisfaction) — xem mục 6 và Rủi ro #2.
- **Xuất Excel**: xuất TKB theo lớp / theo giáo viên / toàn trường ra file `.xlsx`.

### (d) Thi đua cấp lớp
- **Tiêu chí thi đua** (`EmulationCriteria`): danh mục tiêu chí có trọng số (điểm học tập trung bình, số lượt vi phạm nền nếp từ sổ đầu bài, chuyên cần...).
- **Bảng thi đua lớp theo tuần/tháng/kỳ** (`ClassEmulationScore`): tổng hợp tự động từ `ClassPeriodLog` + `ScoreEntry`, Hiệu trưởng/Hiệu phó xem bảng xếp hạng toàn trường.

### (e) Thư viện
- **Đầu sách** (`LibraryBookTitle`), **Bản sao sách** (`LibraryBookCopy`, mỗi bản có mã vạch/tình trạng).
- **Phiếu mượn/trả** (`LibraryLoan`): (bookCopy, student, ngày mượn, hạn trả, ngày trả thực tế, trạng thái quá hạn).

### (f) Lên lớp cuối năm
- **Kết quả cuối năm** (`YearEndResult`): (student, academicYear, điểm TB cả năm tổng hợp từ các môn, xếp loại hạnh kiểm từ thi đua, kết quả: LEN_LOP/O_LAI/THI_LAI).
- **Tác vụ chuyển lớp** (`ClassPromotionJob`): job hàng loạt — Hiệu trưởng xác nhận, hệ thống tạo `StudentClassEnrollment` mới cho năm học kế tiếp, HS đạt → lớp cùng khối-kế-tiếp theo cấu hình ánh xạ lớp (vd 10A1 → 11A1), HS ở lại → giữ nguyên khối.

## 4. Mô hình dữ liệu (Prisma schema)

```prisma
enum Role {
  PRINCIPAL
  VICE_PRINCIPAL
  HOMEROOM_TEACHER
  SUBJECT_TEACHER
  LIBRARIAN
  STUDENT
}

enum PostType {
  LESSON
  ASSIGNMENT
}

enum ScoreType {
  THUONG_XUYEN
  GIUA_KY
  CUOI_KY
}

enum PromotionResult {
  LEN_LOP
  O_LAI
  THI_LAI
}

enum LoanStatus {
  BORROWED
  RETURNED
  OVERDUE
  LOST
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  roles        Role[]
  teacher      Teacher?
  student      Student?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model AcademicYear {
  id         String         @id @default(cuid())
  yearName   String         @unique // vd "2026-2027"
  startDate  DateTime
  endDate    DateTime
  terms      AcademicTerm[]
  classes    SchoolClass[]
  enrollments StudentClassEnrollment[]
  yearEndResults YearEndResult[]
}

model AcademicTerm {
  id             String       @id @default(cuid())
  academicYearId String
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])
  termName       String // "HK1" | "HK2"
  startDate      DateTime
  endDate        DateTime
  assignments    ClassSubjectAssignment[]
  scoreEntries   ScoreEntry[]
  subjectAverages SubjectTermAverage[]
  timetableSlots TimetableSlot[]
  scoreWeightConfigs ScoreWeightConfig[]
  emulationScores ClassEmulationScore[]

  @@unique([academicYearId, termName])
}

model GradeLevel {
  id        String        @id @default(cuid())
  gradeName String        @unique // "Khối 10" | "Khối 11" | "Khối 12"
  sortOrder Int
  classes   SchoolClass[]
}

model Room {
  id            String          @id @default(cuid())
  roomName      String          @unique
  roomType      String // THUONG | THI_NGHIEM | MAY_TINH ...
  capacity      Int
  timetableSlots TimetableSlot[]
}

model Subject {
  id                     String   @id @default(cuid())
  subjectName            String   @unique
  defaultPeriodsPerWeek  Int
  assignments            ClassSubjectAssignment[]
}

model Teacher {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  fullName  String
  phone     String?
  homeroomClasses     SchoolClass[]
  assignments         ClassSubjectAssignment[]
}

model Student {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id])
  fullName      String
  dob           DateTime
  guardianName  String?
  guardianPhone String?
  enrollments      StudentClassEnrollment[]
  lessonPostViews  LessonPostView[]
  submissions      AssignmentSubmission[]
  scoreEntries     ScoreEntry[]
  subjectAverages  SubjectTermAverage[]
  loans            LibraryLoan[]
  yearEndResults   YearEndResult[]
}

model SchoolClass {
  id                 String       @id @default(cuid())
  className          String // "10A1"
  gradeLevelId       String
  gradeLevel         GradeLevel   @relation(fields: [gradeLevelId], references: [id])
  academicYearId     String
  academicYear       AcademicYear @relation(fields: [academicYearId], references: [id])
  homeroomTeacherId  String?
  homeroomTeacher    Teacher?     @relation(fields: [homeroomTeacherId], references: [id])
  enrollments        StudentClassEnrollment[]
  assignments        ClassSubjectAssignment[]
  timetableSlots     TimetableSlot[]
  periodLogs         ClassPeriodLog[]
  emulationScores    ClassEmulationScore[]

  @@unique([className, academicYearId])
}

model StudentClassEnrollment {
  id             String       @id @default(cuid())
  studentId      String
  student        Student      @relation(fields: [studentId], references: [id])
  schoolClassId  String
  schoolClass    SchoolClass  @relation(fields: [schoolClassId], references: [id])
  academicYearId String
  academicYear   AcademicYear @relation(fields: [academicYearId], references: [id])

  @@unique([studentId, academicYearId])
}

model ClassSubjectAssignment {
  id              String       @id @default(cuid())
  schoolClassId   String
  schoolClass     SchoolClass  @relation(fields: [schoolClassId], references: [id])
  subjectId       String
  subject         Subject      @relation(fields: [subjectId], references: [id])
  teacherId       String
  teacher         Teacher      @relation(fields: [teacherId], references: [id])
  academicTermId  String
  academicTerm    AcademicTerm @relation(fields: [academicTermId], references: [id])
  lessonPosts     LessonPost[]
  lessonPlans     LessonPlan[]
  scoreEntries    ScoreEntry[]
  subjectAverages SubjectTermAverage[]
  timetableSlots  TimetableSlot[]

  @@unique([schoolClassId, subjectId, academicTermId]) // 1 môn/lớp/kỳ chỉ 1 GV
}

model LessonPost {
  id          String    @id @default(cuid())
  assignmentId String
  assignment  ClassSubjectAssignment @relation(fields: [assignmentId], references: [id])
  postType    PostType
  title       String
  content     String
  attachments Json? // mảng url đính kèm
  dueDate     DateTime?
  quizMode    Boolean   @default(false) // true = bài tập trắc nghiệm tự chấm
  questions   Question[]
  views       LessonPostView[]
  submissions AssignmentSubmission[]
  createdAt   DateTime  @default(now())
}

model Question {
  id           String   @id @default(cuid())
  lessonPostId String
  lessonPost   LessonPost @relation(fields: [lessonPostId], references: [id])
  content      String
  order        Int
  options      QuestionOption[]
  answers      StudentAnswer[]
}

model QuestionOption {
  id         String   @id @default(cuid())
  questionId String
  question   Question @relation(fields: [questionId], references: [id])
  content    String
  isCorrect  Boolean  @default(false)
  answers    StudentAnswer[]
}

model LessonPostView {
  id           String   @id @default(cuid())
  lessonPostId String
  lessonPost   LessonPost @relation(fields: [lessonPostId], references: [id])
  studentId    String
  student      Student  @relation(fields: [studentId], references: [id])
  viewedAt     DateTime @default(now())

  @@unique([lessonPostId, studentId])
}

model AssignmentSubmission {
  id           String    @id @default(cuid())
  lessonPostId String
  lessonPost   LessonPost @relation(fields: [lessonPostId], references: [id])
  studentId    String
  student      Student   @relation(fields: [studentId], references: [id])
  content      String?   // tự luận: text/file url
  submittedAt  DateTime  @default(now())
  grade        Float?    // tự luận: GV chấm tay; trắc nghiệm: hệ thống tự tính
  feedback     String?
  autoGraded   Boolean   @default(false)
  answers      StudentAnswer[]

  @@unique([lessonPostId, studentId])
}

model StudentAnswer {
  id                     String   @id @default(cuid())
  submissionId           String
  submission             AssignmentSubmission @relation(fields: [submissionId], references: [id])
  questionId             String
  question               Question @relation(fields: [questionId], references: [id])
  selectedOptionId        String
  selectedOption          QuestionOption @relation(fields: [selectedOptionId], references: [id])
  isCorrect              Boolean // snapshot tại thời điểm nộp, phục vụ tính điểm + thống kê

  @@unique([submissionId, questionId])
}

model LessonPlan {
  id           String   @id @default(cuid())
  assignmentId String
  assignment   ClassSubjectAssignment @relation(fields: [assignmentId], references: [id])
  title        String
  content      String
  attachment   String?
  publishedAt  DateTime @default(now())
}

model ScoreWeightConfig {
  id             String       @id @default(cuid())
  academicTermId String
  academicTerm   AcademicTerm @relation(fields: [academicTermId], references: [id])
  txWeight       Float        @default(1)
  gkWeight       Float        @default(2)
  ckWeight       Float        @default(3)

  @@unique([academicTermId])
}

model ScoreEntry {
  id             String       @id @default(cuid())
  studentId      String
  student        Student      @relation(fields: [studentId], references: [id])
  assignmentId   String
  assignment     ClassSubjectAssignment @relation(fields: [assignmentId], references: [id])
  academicTermId String
  academicTerm   AcademicTerm @relation(fields: [academicTermId], references: [id])
  scoreType      ScoreType
  value          Float
  createdAt      DateTime     @default(now())
}

model SubjectTermAverage {
  id             String       @id @default(cuid())
  studentId      String
  student        Student      @relation(fields: [studentId], references: [id])
  assignmentId   String
  assignment     ClassSubjectAssignment @relation(fields: [assignmentId], references: [id])
  academicTermId String
  academicTerm   AcademicTerm @relation(fields: [academicTermId], references: [id])
  averageValue   Float        // computed, cập nhật lại mỗi khi ScoreEntry liên quan thay đổi

  @@unique([studentId, assignmentId, academicTermId])
}

model TimetableSlot {
  id             String       @id @default(cuid())
  schoolClassId  String
  schoolClass    SchoolClass  @relation(fields: [schoolClassId], references: [id])
  assignmentId   String
  assignment     ClassSubjectAssignment @relation(fields: [assignmentId], references: [id])
  roomId         String
  room           Room         @relation(fields: [roomId], references: [id])
  academicTermId String
  academicTerm   AcademicTerm @relation(fields: [academicTermId], references: [id])
  dayOfWeek      Int // 2..7 (Thứ 2 .. Thứ 7)
  periodNo       Int // tiết 1..10
  periodLogs     ClassPeriodLog[]

  @@unique([roomId, academicTermId, dayOfWeek, periodNo])        // phòng không trùng giờ
  @@unique([assignment, academicTermId, dayOfWeek, periodNo])    // GV (qua assignment) không trùng giờ — kiểm tra thêm ở service layer theo teacherId vì assignment là theo lớp
}

model ClassPeriodLog {
  id                    String        @id @default(cuid())
  timetableSlotId       String
  timetableSlot         TimetableSlot @relation(fields: [timetableSlotId], references: [id])
  schoolClassId         String
  schoolClass           SchoolClass   @relation(fields: [schoolClassId], references: [id])
  logDate               DateTime
  attendanceAbsentCount Int           @default(0)
  conductRating         String?       // xếp loại tiết: TOT/KHA/TB/YEU
  note                  String?

  @@unique([timetableSlotId, logDate])
}

model EmulationCriteria {
  id           String @id @default(cuid())
  criteriaName String
  weight       Float
}

model ClassEmulationScore {
  id             String       @id @default(cuid())
  schoolClassId  String
  schoolClass    SchoolClass  @relation(fields: [schoolClassId], references: [id])
  academicTermId String
  academicTerm   AcademicTerm @relation(fields: [academicTermId], references: [id])
  periodLabel    String // "Tuần 1", "Tháng 10"...
  totalScore     Float
  rank           Int?

  @@unique([schoolClassId, academicTermId, periodLabel])
}

model LibraryBookTitle {
  id          String   @id @default(cuid())
  title       String
  author      String?
  isbn        String?  @unique
  totalCopies Int
  copies      LibraryBookCopy[]
}

model LibraryBookCopy {
  id           String   @id @default(cuid())
  bookTitleId  String
  bookTitle    LibraryBookTitle @relation(fields: [bookTitleId], references: [id])
  copyCode     String   @unique
  status       String   @default("AVAILABLE") // AVAILABLE | BORROWED | LOST
  loans        LibraryLoan[]
}

model LibraryLoan {
  id             String     @id @default(cuid())
  bookCopyId     String
  bookCopy       LibraryBookCopy @relation(fields: [bookCopyId], references: [id])
  studentId      String
  student        Student    @relation(fields: [studentId], references: [id])
  borrowedDate   DateTime   @default(now())
  dueDate        DateTime
  returnedDate   DateTime?
  status         LoanStatus @default(BORROWED)
}

model YearEndResult {
  id             String          @id @default(cuid())
  studentId      String
  student        Student         @relation(fields: [studentId], references: [id])
  academicYearId String
  academicYear   AcademicYear    @relation(fields: [academicYearId], references: [id])
  overallAverage Float
  conductRank    String?
  result         PromotionResult

  @@unique([studentId, academicYearId])
}

model ClassPromotionJob {
  id                 String   @id @default(cuid())
  academicYearFromId String
  academicYearToId   String
  status             String   @default("PENDING") // PENDING | RUNNING | DONE | FAILED
  log                String?
  createdAt          DateTime @default(now())
}
```

> Ghi chú: quan hệ `@@unique([assignment, ...])` ở `TimetableSlot` cần cài đặt thêm kiểm tra ở tầng `service` (không chỉ constraint DB) vì ràng buộc thật sự là "giáo viên không trùng giờ dạy 2 lớp khác nhau", trong khi `assignmentId` chỉ đại diện 1 (lớp, môn, kỳ) cụ thể — phải join sang `teacherId` của `assignment` để kiểm tra đúng tất cả slot của giáo viên đó trong cùng khung giờ.

Ghi chú ánh xạ từ 2 repo tham khảo cũ (vẫn hữu ích làm tư liệu thiết kế):
- `LessonPostView` = chính là `PostView` đã xác định ở bản v1 — vấn đề cốt lõi "biết ai đã xem" không có sẵn trong cả 2 repo tham khảo, **vẫn cần tự xây**.
- `ClassEmulationScore` kế thừa ý tưởng `EmulationRecord` của repo đoàn thanh niên (tổng hợp điểm theo đơn vị/chi đoàn) nhưng đơn vị tổng hợp là **lớp** thay vì cá nhân, và input là `ClassPeriodLog` + điểm học tập thay vì điểm phong trào.
- `ScoreEntry` nhiều loại cột (thường xuyên/giữa kỳ/cuối kỳ) lấy cảm hứng từ `GradeTemplate/GradeColumn/GradeValue` linh hoạt của ZenClass, nhưng đơn giản hoá vì quy tắc điểm phổ thông VN đã chuẩn hoá (không cần cấu hình cột tuỳ ý theo từng lớp) — chỉ thêm `ScoreWeightConfig` để hệ số có thể chỉnh được, không hardcode.
- Pattern "mỗi tiết log cần biết tiết đó thuộc slot nào" của `ClassPeriodLog` giữ nguyên ý tưởng v2.

## 5. Đề xuất kiến trúc kỹ thuật

### 5.1. Lựa chọn giữa Next.js-only và tách NestJS riêng

Có 2 phương án khả thi cho yêu cầu "phân tầng tốt, dễ mở rộng, tách backend/frontend":

**(a) Next.js làm cả backend (Route Handlers/Server Actions) + frontend, tổ chức thành 2 thư mục `backend/` và `frontend/` trong 1 monorepo, nhưng cả 2 đều là ứng dụng Next.js** (frontend gọi backend qua HTTP).
- Ưu: 1 stack duy nhất, dev nhanh, **deploy toàn bộ lên Vercel free tier được** (cả backend lẫn frontend là Next.js serverless function, đúng mô hình Vercel tối ưu nhất).
- Nhược: Next.js Route Handlers vốn không ép buộc phân tầng — phải tự kỷ luật giữ cấu trúc module/service/repository rõ ràng (xem 5.2), nếu không dễ suy biến thành code lộn xộn trong `app/api/`.

**(b) Tách hẳn NestJS làm backend riêng** (controller/service/repository/module chuẩn enterprise, dependency injection, OpenAPI tự sinh) + Next.js chỉ làm frontend thuần.
- Ưu: NestJS ép buộc phân tầng rất rõ ràng bằng kiến trúc framework (decorator, module system), chuẩn mực hơn cho team lớn / dự án lâu dài.
- Nhược quyết định: **NestJS không chạy được trên Vercel free tier** (Vercel chỉ chạy serverless function ngắn hạn, NestJS cần process server dài hạn) — mất hoàn toàn mục tiêu "deploy miễn phí" mà user đặt ra khi chuyển từ Frappe sang Next.js. Sẽ cần VPS riêng cho phần NestJS, quay lại đúng vấn đề đã muốn tránh.

**Khuyến nghị: chọn phương án (a)** — vì mục tiêu hàng đầu khi đổi từ Frappe là deploy miễn phí trên Vercel, và quy mô 1 trường không cần tới mức độ phức tạp enterprise của NestJS. Bù lại, bắt buộc kỷ luật tổ chức code trong `backend/` theo cấu trúc phân tầng rõ ràng ở mục 5.2 để không mất đi lợi ích "dễ đọc, dễ mở rộng" mà user yêu cầu.

### 5.2. Cấu trúc monorepo

```
EduConnect/
  backend/                      # Next.js dùng làm API server (Route Handlers), KHÔNG render UI
    prisma/
      schema.prisma
      migrations/
    src/
      app/api/                  # Route Handlers — lớp "controller" mỏng, chỉ parse request + gọi service + trả response
        academic/school-classes/route.ts
        scoring/score-entries/route.ts
        ...
      modules/                  # Logic nghiệp vụ theo domain, KHÔNG phụ thuộc Next.js request/response
        academic/
          academic.service.ts    # business logic (vd tạo StudentClassEnrollment, validate ràng buộc)
          academic.repository.ts # Prisma query thuần, không chứa business rule
          academic.schema.ts     # Zod schema validate input
        scoring/
          scoring.service.ts     # tính SubjectTermAverage dựa trên ScoreWeightConfig
          scoring.repository.ts
          scoring.schema.ts
        scheduling/              # TKB thủ công + thuật toán tự động
        attendance/               # Sổ đầu bài
        emulation/                # Thi đua cấp lớp
        library/                  # Thư viện
        promotion/                # Lên lớp cuối năm
      lib/
        auth/                    # xác thực + hàm permission (mục 2)
        prisma.ts                # Prisma Client singleton
        excel/                   # xuất Excel (TKB)
      middleware.ts
    package.json
    tsconfig.json

  frontend/                      # Next.js thuần UI, KHÔNG import Prisma trực tiếp
    src/
      app/
        (auth)/
        (dashboard)/
          principal/
          homeroom-teacher/
          subject-teacher/
          student/
      components/
        ui/                      # ResponsiveTable, form control... (phong cách lấy từ repo đoàn)
      lib/
        api-client.ts            # wrapper gọi backend qua fetch, xử lý lỗi/token tập trung
        permissions-ui.ts         # check quyền phía client CHỈ để ẩn/hiện UI, không phải nguồn sự thật
      styles/globals.css
    package.json
    tsconfig.json

  docs/
    phan-tich-yeu-cau.md
```

Nguyên tắc phân tầng trong `backend/src/modules/<domain>/`:
- **`*.schema.ts`**: định nghĩa Zod schema cho input/output — route handler validate qua đây trước khi vào service.
- **`*.service.ts`**: chứa toàn bộ business rule (vd: "1 học sinh chỉ enroll 1 lớp/năm", "tính điểm TB theo ScoreWeightConfig", "giáo viên không được trùng giờ dạy"). Gọi permission check ở đây, không phải ở route handler.
- **`*.repository.ts`**: chỉ chứa Prisma query (CRUD thuần), không chứa if/else nghiệp vụ — dễ test, dễ thay đổi ORM sau này nếu cần.
- Route Handler (`app/api/.../route.ts`) chỉ làm 3 việc: parse + validate request bằng schema, gọi đúng 1 hàm service, trả response — không chứa business logic.

`frontend/` gọi `backend/` qua HTTP (REST) qua `api-client.ts` tập trung — không bao giờ import trực tiếp Prisma Client hay code trong `backend/` (đảm bảo tách bạch thật sự, không phải tách tên thư mục nhưng vẫn coupling ngầm).

### 5.3. Authentication & phân quyền
- **NextAuth.js** (Auth.js) hoặc tự viết JWT + session cookie — khuyến nghị NextAuth.js với Credentials Provider (email/password) vì có sẵn session management, giảm code tự viết.
- Middleware ở `backend/` kiểm tra session hợp lệ cho mọi route `/api/**` trừ `/api/auth/**`.
- RBAC theo scope như mục 2 — viết thành các hàm `can*` tái sử dụng trong mọi service.

### 5.4. Database & migration
- **PostgreSQL**, Prisma ORM, schema tại `backend/prisma/schema.prisma` (mục 4).
- Migration qua `prisma migrate dev` (local) / `prisma migrate deploy` (production).

### 5.5. UI — phong cách từ repo đoàn thanh niên
- Copy cấu trúc `globals.css` (biến `@theme`, tông `--color-primary: #0b63b8`, dark mode qua `html.dark`) từ `/tmp/refprojects/doan/src/app/globals.css` vào `frontend/src/styles/globals.css`, đổi huy hiệu nền (`body::before`) sang logo THPT Sơn Hà (cần xin logo trường, dùng placeholder tạm trong lúc chờ).
- Copy ý tưởng `ResponsiveTable`/class `.rtable` (bảng → card trên mobile) từ cùng file (dòng 46-71 bản gốc).
- Route groups `(auth)/(dashboard)` giữ nguyên như v2 đã đề xuất.

### 5.6. Lưu ý thư mục `web/` đã scaffold trước đó
Thư mục `/home/tranvanhuy0642/Projects/My-projects/EduConnect/web` được tạo trong lúc thử nghiệm kiến trúc Frappe — **cần tổ chức lại** theo cấu trúc `frontend/` + `backend/` ở mục 5.2 (đổi tên hoặc tạo lại) trước khi phát triển tiếp, không dùng nguyên trạng.

## 6. Kế hoạch deploy (miễn phí)

- **Frontend + Backend**: deploy cả 2 Next.js app lên **Vercel free tier** (2 project Vercel riêng trỏ tới 2 thư mục trong cùng monorepo, hoặc 1 project build cả 2 nếu cấu hình workspace phù hợp).
- **Database**: Vercel free tier không kèm Postgres persistent đủ dùng — cần Postgres rời. Hai lựa chọn phổ biến cho use case nhỏ (1 trường):
  - **Neon**: free tier có compute auto-suspend khi idle (lần gọi đầu sau khi suspend sẽ chậm hơn — cold start), giới hạn dung lượng storage ở mức nhỏ.
  - **Supabase**: free tier có thể tạm dừng dự án sau một thời gian dài không hoạt động, cũng giới hạn dung lượng storage ở mức nhỏ.
  - *(Lưu ý: số liệu giới hạn cụ thể (GB storage, điều kiện auto-suspend) có thể đã thay đổi so với hiểu biết sẵn có — **cần tra lại giá/hạn mức hiện tại của Neon và Supabase trước khi chọn chính thức**, xem mục Rủi ro #6.)*
- Nếu dữ liệu trường (ảnh đính kèm bài tập, sách thư viện...) vượt free tier storage của DB, cân nhắc dùng object storage riêng (Cloudflare R2 free tier, hoặc Vercel Blob) cho file, chỉ lưu URL trong Postgres.

## 7. Thứ tự triển khai kỹ thuật (không phải cắt giảm phạm vi)

Dù mục tiêu là làm đầy đủ ngay từ đầu, một số phần **phụ thuộc kỹ thuật** vào phần khác nên cần làm trước:

1. **Core tổ chức**: AcademicYear/Term, GradeLevel, SchoolClass, Room, Teacher, Student, StudentClassEnrollment, Subject, ClassSubjectAssignment. *(Bắt buộc xong trước — mọi module khác đều liên kết tới các model này.)*
2. **Học tập cơ bản**: LessonPost + LessonPostView, LessonPlan, ScoreWeightConfig, ScoreEntry + SubjectTermAverage. Sau đó mới thêm Question/QuestionOption/StudentAnswer cho trắc nghiệm (phụ thuộc LessonPost đã ổn định).
3. **Thời khóa biểu thủ công** (TimetableSlot nhập tay) — chạy được TKB thủ công trước, vì **sinh TKB tự động cần dữ liệu lớp/môn/GV/phòng/số tiết chuẩn đã đầy đủ và ổn định mới có input đúng để xếp**; làm thuật toán tự động song song nhưng chỉ bật dùng thật sau khi core data đã nhập đủ cho ít nhất 1 học kỳ.
4. **Sổ đầu bài** (ClassPeriodLog) — phụ thuộc TimetableSlot đã có.
5. **Thi đua cấp lớp** — phụ thuộc ClassPeriodLog + ScoreEntry đã có dữ liệu để tổng hợp.
6. **Thư viện** — độc lập hoàn toàn với các module trên, có thể làm song song từ đầu bởi một luồng công việc riêng.
7. **Sinh TKB tự động (thuật toán)** — phát triển song song từ sớm nhưng cần input từ bước 1 để test thật; đây là phần rủi ro kỹ thuật cao nhất, nên có buffer thời gian riêng (xem Rủi ro #2).
8. **Lên lớp cuối năm** — chỉ cần hoàn thiện trước thời điểm kết thúc năm học đầu tiên sử dụng hệ thống, không cấp bách bằng các phần trên.

## 8. Rủi ro & câu hỏi mở cần xác nhận với user

1. **Công thức tính điểm trung bình môn cụ thể?** Hệ số mặc định trong `ScoreWeightConfig` là (TX×1 + GK×2 + CK×3)/(sốTX + 2 + 3) theo Thông tư đánh giá học sinh phổ thông phổ biến — **Admin cấu hình lại được qua UI**, nhưng cần xác nhận công thức có đúng dạng tuyến tính đơn giản này không, hay trường Sơn Hà có quy chế tính khác (vd làm tròn theo quy tắc riêng, loại bỏ điểm thấp nhất...).
2. **Thuật toán xếp TKB tự động ưu tiên gì khi xung đột?** (ví dụ: GV dạy nhiều lớp bị trùng giờ, phòng đặc thù — Lab/Tin học — không đủ cho mọi lớp cùng tiết). Cần biết: có GV nào bị giới hạn số tiết/ngày không, có môn nào bắt buộc xếp liên tiếp (vd Thể dục ngoài trời) không, độ ưu tiên giữa "tối ưu cho GV" và "tối ưu cho lớp".
3. Chốt điểm/khoá sửa sau khi kết thúc học kỳ: có cần cơ chế khóa (trạng thái `LOCKED`) để tránh sửa điểm sau khi đã công bố kết quả không?
4. **Chọn Neon hay Supabase cho Postgres free tier?** Cần tra lại hạn mức/điều kiện hiện tại (storage, cold start/auto-suspend) trước khi quyết định chính thức — xem mục 6.
5. File đính kèm (bài tập, ảnh sổ đầu bài...) lưu ở đâu nếu vượt quá free tier của DB — có cần tích hợp object storage (Cloudflare R2/Vercel Blob) ngay từ đầu hay để sau?
6. Phụ huynh (`Guardian`) để giai đoạn sau theo đã chốt — xác nhận lại mốc thời gian dự kiến triển khai giai đoạn này (sau khi core ổn định bao lâu).
