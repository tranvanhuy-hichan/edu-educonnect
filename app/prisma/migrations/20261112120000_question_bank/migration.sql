-- Ngân hàng câu hỏi riêng của từng giáo viên + bài tập trắc nghiệm tự chấm.
-- Các bảng Question / QuestionOption / StudentAnswer trước đây chưa có chức năng nào ghi dữ liệu vào, nên xóa sạch để đổi cấu trúc.
DELETE FROM "StudentAnswer";
DELETE FROM "QuestionOption";
DELETE FROM "Question";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_exerciseId_fkey";
ALTER TABLE "StudentAnswer" DROP CONSTRAINT "StudentAnswer_selectedOptionId_fkey";
ALTER TABLE "StudentAnswer" DROP CONSTRAINT "StudentAnswer_submissionId_fkey";
ALTER TABLE "QuestionOption" DROP CONSTRAINT "QuestionOption_questionId_fkey";

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN "showAnswers" TEXT NOT NULL DEFAULT 'AFTER_DUE';

ALTER TABLE "Question" DROP COLUMN "exerciseId",
ADD COLUMN "answerKey" JSONB,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "explanation" TEXT,
ADD COLUMN "gradeLevelId" TEXT,
ADD COLUMN "images" JSONB,
ADD COLUMN "parentId" TEXT,
ADD COLUMN "subjectId" TEXT NOT NULL,
ADD COLUMN "teacherId" TEXT NOT NULL,
ADD COLUMN "topic" TEXT,
ADD COLUMN "type" TEXT NOT NULL,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "order" SET DEFAULT 0;

ALTER TABLE "QuestionOption" ADD COLUMN "images" JSONB,
ADD COLUMN "label" TEXT NOT NULL,
ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StoredFile" ALTER COLUMN "assignmentId" DROP NOT NULL;

ALTER TABLE "StudentAnswer" DROP COLUMN "selectedOptionId",
ADD COLUMN "answer" JSONB,
ADD COLUMN "maxScore" DOUBLE PRECISION NOT NULL,
ADD COLUMN "score" DOUBLE PRECISION NOT NULL;

-- CreateTable
CREATE TABLE "ExerciseQuestion" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "ExerciseQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseQuestion_exerciseId_questionId_key" ON "ExerciseQuestion"("exerciseId", "questionId");
CREATE INDEX "Question_teacherId_subjectId_archivedAt_idx" ON "Question"("teacherId", "subjectId", "archivedAt");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseQuestion" ADD CONSTRAINT "ExerciseQuestion_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseQuestion" ADD CONSTRAINT "ExerciseQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
