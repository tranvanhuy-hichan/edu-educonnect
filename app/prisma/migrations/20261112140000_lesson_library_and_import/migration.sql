-- Ngân hàng bài học, bài tập mẫu, bài ôn tập, phiên nhập tệp bằng AI.

-- AlterTable
ALTER TABLE "LessonPost" ADD COLUMN "sourceLessonId" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "sourceExerciseId" TEXT;
ALTER TABLE "Question" ADD COLUMN "libraryLessonId" TEXT,
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "importJobId" TEXT;

-- CreateTable
CREATE TABLE "LibraryLesson" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB,
    "orderNo" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LibraryLesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LibraryExercise" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NORMAL',
    "quizMode" BOOLEAN NOT NULL DEFAULT true,
    "instructions" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB,
    "showAnswers" TEXT NOT NULL DEFAULT 'AFTER_DUE',
    "orderNo" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LibraryExercise_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LibraryExerciseQuestion" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1,
    CONSTRAINT "LibraryExerciseQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LibraryExerciseSource" (
    "exerciseId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    CONSTRAINT "LibraryExerciseSource_pkey" PRIMARY KEY ("exerciseId","lessonId")
);

CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "libraryLessonId" TEXT,
    "libraryExerciseId" TEXT,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonPost_sourceLessonId_idx" ON "LessonPost"("sourceLessonId");
CREATE INDEX "Question_libraryLessonId_idx" ON "Question"("libraryLessonId");
CREATE INDEX "Question_importJobId_idx" ON "Question"("importJobId");
CREATE INDEX "LibraryLesson_teacherId_subjectId_gradeLevelId_archivedAt_idx" ON "LibraryLesson"("teacherId", "subjectId", "gradeLevelId", "archivedAt");
CREATE UNIQUE INDEX "LibraryExerciseQuestion_exerciseId_questionId_key" ON "LibraryExerciseQuestion"("exerciseId", "questionId");
CREATE INDEX "ImportJob_teacherId_createdAt_idx" ON "ImportJob"("teacherId", "createdAt");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_libraryLessonId_fkey" FOREIGN KEY ("libraryLessonId") REFERENCES "LibraryLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryLesson" ADD CONSTRAINT "LibraryLesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LibraryLesson" ADD CONSTRAINT "LibraryLesson_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LibraryLesson" ADD CONSTRAINT "LibraryLesson_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LibraryExercise" ADD CONSTRAINT "LibraryExercise_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "LibraryLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LibraryExerciseQuestion" ADD CONSTRAINT "LibraryExerciseQuestion_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "LibraryExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryExerciseQuestion" ADD CONSTRAINT "LibraryExerciseQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LibraryExerciseSource" ADD CONSTRAINT "LibraryExerciseSource_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "LibraryExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryExerciseSource" ADD CONSTRAINT "LibraryExerciseSource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "LibraryLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_libraryLessonId_fkey" FOREIGN KEY ("libraryLessonId") REFERENCES "LibraryLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
