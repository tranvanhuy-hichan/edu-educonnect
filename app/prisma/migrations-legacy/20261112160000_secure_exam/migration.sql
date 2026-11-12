-- Chế độ thi nghiêm túc cho bài trắc nghiệm: chỉ THÊM cột có giá trị mặc định và một bảng mới, không xóa/đổi dữ liệu hiện có.
ALTER TABLE "Exercise" ADD COLUMN "secureMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maxViolations" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "LibraryExercise" ADD COLUMN "secureMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maxViolations" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "AssignmentSubmission" ADD COLUMN "autoSubmitted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ExamViolation" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamViolation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExamViolation_exerciseId_studentId_idx" ON "ExamViolation"("exerciseId", "studentId");

ALTER TABLE "ExamViolation" ADD CONSTRAINT "ExamViolation_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamViolation" ADD CONSTRAINT "ExamViolation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
