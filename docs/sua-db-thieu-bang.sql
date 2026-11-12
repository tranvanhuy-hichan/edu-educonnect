-- ============================================================================
-- BƯỚC 1 — CHỈ ĐỌC. Dán vào Supabase → SQL Editor → Run, rồi gửi kết quả cho mình.
-- Cho biết DB thật đang thiếu bảng/cột nào mà code mới cần.
-- ============================================================================
SELECT 'bang' AS loai, t AS ten, EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) AS co_chua
FROM unnest(ARRAY['LoginThrottle','Job','ErrorLog','ParentNotification','ParentOtp','SmsLog','UserSession','TrashItem','ReminderSent','ApiKey','ApiRequestLog','StudentYouth','ApiChange','ApiIdempotency','QuizAttempt','StoredFile','ImportJob']) AS t
UNION ALL
SELECT 'cot', 'QuizAttempt.snapshot', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='QuizAttempt' AND column_name='snapshot')
UNION ALL
SELECT 'cot', 'AssignmentSubmission.extraAttempts', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AssignmentSubmission' AND column_name='extraAttempts')
UNION ALL
SELECT 'cot', 'AssignmentSubmission.isLate', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='AssignmentSubmission' AND column_name='isLate');

-- ============================================================================
-- BƯỚC 2 — GHI. CHỈ CHẠY SAU KHI: (a) đã sao lưu DB, (b) bước 1 cho thấy QuizAttempt, StoredFile, ImportJob đều "true".
-- Chạy trong một transaction: lỗi ở đâu thì huỷ hết, không để DB nửa vời. Có thể chạy lại nhiều lần (idempotent).
-- ============================================================================
BEGIN;

ALTER TABLE "QuizAttempt" ADD COLUMN IF NOT EXISTS "snapshot" JSONB;
ALTER TABLE "AssignmentSubmission" ADD COLUMN IF NOT EXISTS "extraAttempts" INTEGER NOT NULL DEFAULT 0;

-- Bảng chặn đăng nhập quá nhiều lần: thiếu bảng này thì ĐĂNG NHẬP BỊ LỖI.
CREATE TABLE IF NOT EXISTS "LoginThrottle" (
  "key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "LoginThrottle_expiresAt_idx" ON "LoginThrottle"("expiresAt");

UPDATE "QuizAttempt" a SET "snapshot" = jsonb_build_object('legacy', true, 'answers',
  COALESCE((SELECT jsonb_agg(to_jsonb(ans)) FROM "StudentAnswer" ans WHERE ans."submissionId" = s.id), '[]'::jsonb))
FROM "AssignmentSubmission" s WHERE a."snapshot" IS NULL AND a."exerciseId" = s."exerciseId" AND a."studentId" = s."studentId" AND a."attemptNo" = s."attemptNo";

-- Hàng đợi tác vụ nền
CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dedupeKey" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB,
  "lastError" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Job_dedupeKey_key" ON "Job"("dedupeKey");
CREATE INDEX IF NOT EXISTS "Job_status_runAt_idx" ON "Job"("status", "runAt");
CREATE INDEX IF NOT EXISTS "Job_type_createdAt_idx" ON "Job"("type", "createdAt");

-- Nhật ký lỗi hệ thống (gom theo fingerprint)
CREATE TABLE IF NOT EXISTS "ErrorLog" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "route" TEXT,
  "method" TEXT,
  "digest" TEXT,
  "requestId" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ErrorLog_fingerprint_key" ON "ErrorLog"("fingerprint");
CREATE INDEX IF NOT EXISTS "ErrorLog_status_lastSeenAt_idx" ON "ErrorLog"("status", "lastSeenAt");

-- Chỉ mục cho các truy vấn nóng (khoá ngoại dùng để join/lọc, sắp xếp nhật ký)
CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_actorEmail_idx" ON "ActivityLog"("actorEmail");
CREATE INDEX IF NOT EXISTS "ActivityLog_targetType_createdAt_idx" ON "ActivityLog"("targetType", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentClassEnrollment_schoolClassId_academicYearId_idx" ON "StudentClassEnrollment"("schoolClassId", "academicYearId");
CREATE INDEX IF NOT EXISTS "ClassSubjectAssignment_teacherId_academicTermId_idx" ON "ClassSubjectAssignment"("teacherId", "academicTermId");
CREATE INDEX IF NOT EXISTS "ClassSubjectAssignment_subjectId_idx" ON "ClassSubjectAssignment"("subjectId");
CREATE INDEX IF NOT EXISTS "LessonPost_assignmentId_idx" ON "LessonPost"("assignmentId");
CREATE INDEX IF NOT EXISTS "Exercise_lessonPostId_idx" ON "Exercise"("lessonPostId");
CREATE INDEX IF NOT EXISTS "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");
CREATE INDEX IF NOT EXISTS "Question_subjectId_gradeLevelId_idx" ON "Question"("subjectId", "gradeLevelId");
CREATE INDEX IF NOT EXISTS "QuizAttempt_studentId_idx" ON "QuizAttempt"("studentId");
CREATE INDEX IF NOT EXISTS "AssignmentSubmission_studentId_idx" ON "AssignmentSubmission"("studentId");
CREATE INDEX IF NOT EXISTS "LessonPostView_studentId_idx" ON "LessonPostView"("studentId");
CREATE INDEX IF NOT EXISTS "StudentAnswer_questionId_idx" ON "StudentAnswer"("questionId");
CREATE INDEX IF NOT EXISTS "ScoreEntry_studentId_academicTermId_idx" ON "ScoreEntry"("studentId", "academicTermId");
CREATE INDEX IF NOT EXISTS "ScoreEntry_assignmentId_idx" ON "ScoreEntry"("assignmentId");
CREATE INDEX IF NOT EXISTS "SubjectTermAverage_assignmentId_idx" ON "SubjectTermAverage"("assignmentId");
CREATE INDEX IF NOT EXISTS "TimetableSlot_schoolClassId_versionId_idx" ON "TimetableSlot"("schoolClassId", "versionId");
CREATE INDEX IF NOT EXISTS "TimetableSlot_versionId_idx" ON "TimetableSlot"("versionId");
CREATE INDEX IF NOT EXISTS "ClassPeriodLog_schoolClassId_idx" ON "ClassPeriodLog"("schoolClassId");
CREATE INDEX IF NOT EXISTS "ClassPeriodAbsence_studentId_idx" ON "ClassPeriodAbsence"("studentId");
CREATE INDEX IF NOT EXISTS "LibraryLoan_studentId_idx" ON "LibraryLoan"("studentId");
CREATE INDEX IF NOT EXISTS "LibraryLoanItem_loanId_idx" ON "LibraryLoanItem"("loanId");
CREATE INDEX IF NOT EXISTS "LibraryLoanItem_bookCopyId_idx" ON "LibraryLoanItem"("bookCopyId");
CREATE INDEX IF NOT EXISTS "LibraryBookCopy_bookTitleId_idx" ON "LibraryBookCopy"("bookTitleId");
CREATE INDEX IF NOT EXISTS "YearEndResult_academicYearId_idx" ON "YearEndResult"("academicYearId");
CREATE INDEX IF NOT EXISTS "ExamInvigilation_teacherId_idx" ON "ExamInvigilation"("teacherId");
CREATE INDEX IF NOT EXISTS "StudentAssessment_assignmentId_idx" ON "StudentAssessment"("assignmentId");
CREATE INDEX IF NOT EXISTS "TeacherSubject_subjectId_idx" ON "TeacherSubject"("subjectId");
CREATE INDEX IF NOT EXISTS "SchoolClass_gradeLevelId_idx" ON "SchoolClass"("gradeLevelId");
CREATE INDEX IF NOT EXISTS "SchoolClass_homeroomTeacherId_idx" ON "SchoolClass"("homeroomTeacherId");
-- Thông báo cho phụ huynh + xác minh SMS (migration 20261115 và 20261116)
-- Thông báo cho phụ huynh (khoá theo 9 số cuối SĐT người giám hộ)
CREATE TABLE IF NOT EXISTS "ParentNotification" (
  "id" TEXT NOT NULL,
  "phoneKey" TEXT NOT NULL,
  "studentId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'SYSTEM',
  "link" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ParentNotification_phoneKey_isRead_idx" ON "ParentNotification"("phoneKey", "isRead");
CREATE INDEX IF NOT EXISTS "ParentNotification_phoneKey_createdAt_idx" ON "ParentNotification"("phoneKey", "createdAt");

-- Xác minh SMS cho phụ huynh + nhật ký SMS
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "mustChangePwd" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ParentOtp" (
  "id" TEXT NOT NULL,
  "phoneKey" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentOtp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ParentOtp_phoneKey_createdAt_idx" ON "ParentOtp"("phoneKey", "createdAt");

CREATE TABLE IF NOT EXISTS "SmsLog" (
  "id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "phoneHash" TEXT NOT NULL,
  "phoneMasked" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerCode" TEXT,
  "providerRef" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SmsLog_createdAt_idx" ON "SmsLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SmsLog_phoneHash_createdAt_idx" ON "SmsLog"("phoneHash", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsLog_status_createdAt_idx" ON "SmsLog"("status", "createdAt");

-- Phiên đăng nhập, khoá tạm, thùng rác, nhắc việc, hướng dẫn lần đầu (migration 20261117)
-- Phiên đăng nhập, khoá tạm, thùng rác, nhắc việc, hướng dẫn lần đầu
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokensValidAfter" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLogins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "UserSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "device" TEXT NOT NULL,
  "ipMasked" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UserSession_userId_revokedAt_idx" ON "UserSession"("userId", "revokedAt");
DO $$ BEGIN
  ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TrashItem" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "detail" TEXT,
  "payload" JSONB NOT NULL,
  "deletedBy" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "restoredAt" TIMESTAMP(3),
  CONSTRAINT "TrashItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TrashItem_kind_deletedAt_idx" ON "TrashItem"("kind", "deletedAt");
CREATE INDEX IF NOT EXISTS "TrashItem_expiresAt_idx" ON "TrashItem"("expiresAt");

CREATE TABLE IF NOT EXISTS "ReminderSent" (
  "key" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReminderSent_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "ReminderSent_createdAt_idx" ON "ReminderSent"("createdAt");

-- Khoá API cho hệ thống bên ngoài (migration 20261118)
-- Khoá API cho hệ thống bên ngoài + nhật ký gọi API
CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" TEXT[],
  "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "rateLimitPerMin" INTEGER NOT NULL DEFAULT 120,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "lastUsedIp" TEXT,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

CREATE TABLE IF NOT EXISTS "ApiRequestLog" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "status" INTEGER NOT NULL,
  "ms" INTEGER NOT NULL,
  "ipMasked" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiRequestLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ApiRequestLog_keyId_createdAt_idx" ON "ApiRequestLog"("keyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiRequestLog_createdAt_idx" ON "ApiRequestLog"("createdAt");
DO $$ BEGIN
  ALTER TABLE "ApiRequestLog" ADD CONSTRAINT "ApiRequestLog_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- API ngoài có GHI: thông tin Đoàn, nhật ký thay đổi, chống gửi trùng (migration 20261119)
-- API ngoài có GHI: thông tin Đoàn, nhật ký thay đổi (hoàn tác), chống gửi trùng
CREATE TABLE IF NOT EXISTS "StudentYouth" (
  "studentId" TEXT NOT NULL,
  "isMember" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3),
  "branch" TEXT,
  "position" TEXT,
  "note" TEXT,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentYouth_pkey" PRIMARY KEY ("studentId")
);
DO $$ BEGIN
  ALTER TABLE "StudentYouth" ADD CONSTRAINT "StudentYouth_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ApiChange" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revertedAt" TIMESTAMP(3),
  "revertedBy" TEXT,
  CONSTRAINT "ApiChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ApiChange_createdAt_idx" ON "ApiChange"("createdAt");
CREATE INDEX IF NOT EXISTS "ApiChange_keyId_createdAt_idx" ON "ApiChange"("keyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiChange_entityType_entityId_idx" ON "ApiChange"("entityType", "entityId");
DO $$ BEGIN
  ALTER TABLE "ApiChange" ADD CONSTRAINT "ApiChange_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ApiIdempotency" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "idemKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" INTEGER NOT NULL DEFAULT 0,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiIdempotency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiIdempotency_keyId_idemKey_key" ON "ApiIdempotency"("keyId", "idemKey");
CREATE INDEX IF NOT EXISTS "ApiIdempotency_createdAt_idx" ON "ApiIdempotency"("createdAt");
DO $$ BEGIN
  ALTER TABLE "ApiIdempotency" ADD CONSTRAINT "ApiIdempotency_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
