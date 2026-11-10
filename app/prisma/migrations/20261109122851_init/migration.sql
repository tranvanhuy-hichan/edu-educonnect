-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PRINCIPAL', 'VICE_PRINCIPAL', 'HOMEROOM_TEACHER', 'SUBJECT_TEACHER', 'LIBRARIAN', 'STUDENT');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('LESSON', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "ScoreType" AS ENUM ('THUONG_XUYEN', 'GIUA_KY', 'CUOI_KY');

-- CreateEnum
CREATE TYPE "PromotionResult" AS ENUM ('LEN_LOP', 'O_LAI', 'THI_LAI');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('BORROWED', 'RETURNED', 'OVERDUE', 'LOST');

-- CreateEnum
CREATE TYPE "BookCopyStatus" AS ENUM ('AVAILABLE', 'BORROWED', 'LOST');

-- CreateEnum
CREATE TYPE "PromotionJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roles" "Role"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "yearName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicTerm" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeLevel" (
    "id" TEXT NOT NULL,
    "gradeName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "GradeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "defaultPeriodsPerWeek" INTEGER NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "guardianName" TEXT,
    "guardianPhone" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "homeroomTeacherId" TEXT,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentClassEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,

    CONSTRAINT "StudentClassEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSubjectAssignment" (
    "id" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,

    CONSTRAINT "ClassSubjectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPost" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "postType" "PostType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "dueDate" TIMESTAMP(3),
    "quizMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "lessonPostId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPostView" (
    "id" TEXT NOT NULL,
    "lessonPostId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPostView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentSubmission" (
    "id" TEXT NOT NULL,
    "lessonPostId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "autoGraded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAnswer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,

    CONSTRAINT "StudentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPlan" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachment" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreWeightConfig" (
    "id" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "txWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "gkWeight" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "ckWeight" DOUBLE PRECISION NOT NULL DEFAULT 3,

    CONSTRAINT "ScoreWeightConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "scoreType" "ScoreType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectTermAverage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "averageValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SubjectTermAverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassPeriodLog" (
    "id" TEXT NOT NULL,
    "timetableSlotId" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "attendanceAbsentCount" INTEGER NOT NULL DEFAULT 0,
    "conductRating" TEXT,
    "note" TEXT,

    CONSTRAINT "ClassPeriodLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmulationCriteria" (
    "id" TEXT NOT NULL,
    "criteriaName" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EmulationCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassEmulationScore" (
    "id" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER,

    CONSTRAINT "ClassEmulationScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryBookTitle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "totalCopies" INTEGER NOT NULL,

    CONSTRAINT "LibraryBookTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryBookCopy" (
    "id" TEXT NOT NULL,
    "bookTitleId" TEXT NOT NULL,
    "copyCode" TEXT NOT NULL,
    "status" "BookCopyStatus" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "LibraryBookCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryLoan" (
    "id" TEXT NOT NULL,
    "bookCopyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "borrowedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "returnedDate" TIMESTAMP(3),
    "status" "LoanStatus" NOT NULL DEFAULT 'BORROWED',

    CONSTRAINT "LibraryLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YearEndResult" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "overallAverage" DOUBLE PRECISION NOT NULL,
    "conductRank" TEXT,
    "result" "PromotionResult" NOT NULL,

    CONSTRAINT "YearEndResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassPromotionJob" (
    "id" TEXT NOT NULL,
    "academicYearFromId" TEXT NOT NULL,
    "academicYearToId" TEXT NOT NULL,
    "status" "PromotionJobStatus" NOT NULL DEFAULT 'PENDING',
    "log" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassPromotionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_yearName_key" ON "AcademicYear"("yearName");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicTerm_academicYearId_termName_key" ON "AcademicTerm"("academicYearId", "termName");

-- CreateIndex
CREATE UNIQUE INDEX "GradeLevel_gradeName_key" ON "GradeLevel"("gradeName");

-- CreateIndex
CREATE UNIQUE INDEX "Room_roomName_key" ON "Room"("roomName");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_subjectName_key" ON "Subject"("subjectName");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_userId_key" ON "Teacher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_className_academicYearId_key" ON "SchoolClass"("className", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentClassEnrollment_studentId_academicYearId_key" ON "StudentClassEnrollment"("studentId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSubjectAssignment_schoolClassId_subjectId_academicTerm_key" ON "ClassSubjectAssignment"("schoolClassId", "subjectId", "academicTermId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonPostView_lessonPostId_studentId_key" ON "LessonPostView"("lessonPostId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmission_lessonPostId_studentId_key" ON "AssignmentSubmission"("lessonPostId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAnswer_submissionId_questionId_key" ON "StudentAnswer"("submissionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreWeightConfig_academicTermId_key" ON "ScoreWeightConfig"("academicTermId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectTermAverage_studentId_assignmentId_academicTermId_key" ON "SubjectTermAverage"("studentId", "assignmentId", "academicTermId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_roomId_academicTermId_dayOfWeek_periodNo_key" ON "TimetableSlot"("roomId", "academicTermId", "dayOfWeek", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_assignmentId_academicTermId_dayOfWeek_periodN_key" ON "TimetableSlot"("assignmentId", "academicTermId", "dayOfWeek", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "ClassPeriodLog_timetableSlotId_logDate_key" ON "ClassPeriodLog"("timetableSlotId", "logDate");

-- CreateIndex
CREATE UNIQUE INDEX "ClassEmulationScore_schoolClassId_academicTermId_periodLabe_key" ON "ClassEmulationScore"("schoolClassId", "academicTermId", "periodLabel");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBookTitle_isbn_key" ON "LibraryBookTitle"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBookCopy_copyCode_key" ON "LibraryBookCopy"("copyCode");

-- CreateIndex
CREATE UNIQUE INDEX "YearEndResult_studentId_academicYearId_key" ON "YearEndResult"("studentId", "academicYearId");

-- AddForeignKey
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_homeroomTeacherId_fkey" FOREIGN KEY ("homeroomTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClassEnrollment" ADD CONSTRAINT "StudentClassEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClassEnrollment" ADD CONSTRAINT "StudentClassEnrollment_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClassEnrollment" ADD CONSTRAINT "StudentClassEnrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPost" ADD CONSTRAINT "LessonPost_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_lessonPostId_fkey" FOREIGN KEY ("lessonPostId") REFERENCES "LessonPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPostView" ADD CONSTRAINT "LessonPostView_lessonPostId_fkey" FOREIGN KEY ("lessonPostId") REFERENCES "LessonPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPostView" ADD CONSTRAINT "LessonPostView_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_lessonPostId_fkey" FOREIGN KEY ("lessonPostId") REFERENCES "LessonPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssignmentSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreWeightConfig" ADD CONSTRAINT "ScoreWeightConfig_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectTermAverage" ADD CONSTRAINT "SubjectTermAverage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectTermAverage" ADD CONSTRAINT "SubjectTermAverage_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectTermAverage" ADD CONSTRAINT "SubjectTermAverage_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassPeriodLog" ADD CONSTRAINT "ClassPeriodLog_timetableSlotId_fkey" FOREIGN KEY ("timetableSlotId") REFERENCES "TimetableSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassPeriodLog" ADD CONSTRAINT "ClassPeriodLog_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassEmulationScore" ADD CONSTRAINT "ClassEmulationScore_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassEmulationScore" ADD CONSTRAINT "ClassEmulationScore_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryBookCopy" ADD CONSTRAINT "LibraryBookCopy_bookTitleId_fkey" FOREIGN KEY ("bookTitleId") REFERENCES "LibraryBookTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "LibraryBookCopy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YearEndResult" ADD CONSTRAINT "YearEndResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YearEndResult" ADD CONSTRAINT "YearEndResult_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
