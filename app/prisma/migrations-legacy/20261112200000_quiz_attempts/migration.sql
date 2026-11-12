-- Số lần làm, cách tính điểm, giới hạn thời gian, cho xem lại bài + lịch sử từng lượt làm. Chỉ THÊM cột có giá trị mặc định và một bảng mới.
ALTER TABLE "Exercise" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "attemptScoring" TEXT NOT NULL DEFAULT 'BEST',
ADD COLUMN "timeLimitMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "allowReview" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LibraryExercise" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "attemptScoring" TEXT NOT NULL DEFAULT 'BEST',
ADD COLUMN "timeLimitMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "allowReview" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "AssignmentSubmission" ADD COLUMN "attemptNo" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "grade" DOUBLE PRECISION,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "overtime" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuizAttempt_exerciseId_studentId_attemptNo_key" ON "QuizAttempt"("exerciseId", "studentId", "attemptNo");

ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bài nộp trắc nghiệm đã có (1 lần) được ghi nhận thành lượt làm số 1 để lịch sử và số lần làm khớp với dữ liệu cũ.
INSERT INTO "QuizAttempt" ("id", "exerciseId", "studentId", "attemptNo", "startedAt", "submittedAt", "grade", "isLate", "autoSubmitted")
SELECT 'qa_' || s."id", s."exerciseId", s."studentId", 1, s."submittedAt", s."submittedAt", s."grade", s."isLate", s."autoSubmitted"
FROM "AssignmentSubmission" s WHERE s."autoGraded" = true;
