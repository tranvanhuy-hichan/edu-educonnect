-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "edu";

-- CreateEnum
CREATE TYPE "edu"."Role" AS ENUM ('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'HOMEROOM_TEACHER', 'SUBJECT_TEACHER', 'LIBRARIAN', 'STUDENT');

-- CreateEnum
CREATE TYPE "edu"."ScoreType" AS ENUM ('THUONG_XUYEN', 'GIUA_KY', 'CUOI_KY');

-- CreateEnum
CREATE TYPE "edu"."AssessmentType" AS ENUM ('SCORE', 'COMMENT');

-- CreateEnum
CREATE TYPE "edu"."AssessmentOutcome" AS ENUM ('DAT', 'CHUA_DAT');

-- CreateEnum
CREATE TYPE "edu"."ReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "edu"."PromotionResult" AS ENUM ('CHUA_DU_DIEU_KIEN', 'LEN_LOP', 'O_LAI', 'THI_LAI');

-- CreateEnum
CREATE TYPE "edu"."LoanStatus" AS ENUM ('BORROWED', 'RETURNED', 'PARTIALLY_RETURNED', 'OVERDUE', 'LOST');

-- CreateEnum
CREATE TYPE "edu"."BookCopyStatus" AS ENUM ('AVAILABLE', 'BORROWED', 'LOST');

-- CreateEnum
CREATE TYPE "edu"."PromotionJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "edu"."StudyShift" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "edu"."ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "edu"."ExamGrouping" AS ENUM ('CLASS', 'ALPHABET');

-- CreateTable
CREATE TABLE "edu"."User" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roles" "edu"."Role"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMP(3),
    "tokensValidAfter" TIMESTAMP(3),
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ActivityLog" (
    "id" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "reason" TEXT,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."AcademicYear" (
    "id" TEXT NOT NULL,
    "yearName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."AcademicTerm" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "termName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "gradesHidden" BOOLEAN NOT NULL DEFAULT false,
    "gradesHiddenAt" TIMESTAMP(3),
    "gradesHiddenBy" TEXT,
    "gradesHiddenNote" TEXT,

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."GradeLevel" (
    "id" TEXT NOT NULL,
    "gradeName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "GradeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."Room" (
    "id" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."Subject" (
    "assessmentType" "edu"."AssessmentType" NOT NULL DEFAULT 'SCORE',
    "annualPeriods" INTEGER NOT NULL DEFAULT 70,
    "id" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "defaultPeriodsPerWeek" INTEGER NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."Teacher" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "gender" TEXT,
    "dob" TIMESTAMP(3),
    "contactEmail" TEXT,
    "address" TEXT,
    "idNumber" TEXT,
    "degree" TEXT,
    "startDate" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."TeacherSubject" (
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,

    CONSTRAINT "TeacherSubject_pkey" PRIMARY KEY ("teacherId","subjectId")
);

-- CreateTable
CREATE TABLE "edu"."Student" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "userId" TEXT NOT NULL,
    "memberId" TEXT,
    "fullName" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "gender" TEXT,
    "birthPlace" TEXT,
    "ethnicity" TEXT,
    "idNumber" TEXT,
    "phone" TEXT,
    "contactEmail" TEXT,
    "address" TEXT,
    "guardianRelation" TEXT,
    "guardianEmail" TEXT,
    "guardianJob" TEXT,
    "note" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."SchoolClass" (
    "roomId" TEXT,
    "id" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "homeroomTeacherId" TEXT,
    "monitorStudentId" TEXT,
    "shift" "edu"."StudyShift" NOT NULL DEFAULT 'MORNING',

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."StudentClassEnrollment" (
    "currentClassSince" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,

    CONSTRAINT "StudentClassEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ClassSubject" (
    "schoolClassId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,

    CONSTRAINT "ClassSubject_pkey" PRIMARY KEY ("schoolClassId","subjectId")
);

-- CreateTable
CREATE TABLE "edu"."ClassSubjectAssignment" (
    "id" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,

    CONSTRAINT "ClassSubjectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LessonPost" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "sourceLessonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."Exercise" (
    "id" TEXT NOT NULL,
    "lessonPostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "dueDate" TIMESTAMP(3),
    "quizMode" BOOLEAN NOT NULL DEFAULT false,
    "showAnswers" TEXT NOT NULL DEFAULT 'AFTER_DUE',
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "attemptScoring" TEXT NOT NULL DEFAULT 'BEST',
    "timeLimitMinutes" INTEGER NOT NULL DEFAULT 0,
    "allowReview" BOOLEAN NOT NULL DEFAULT true,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "secureMode" BOOLEAN NOT NULL DEFAULT false,
    "maxViolations" INTEGER NOT NULL DEFAULT 3,
    "sourceExerciseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."Question" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "gradeLevelId" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" JSONB,
    "topic" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "explanation" TEXT,
    "answerKey" JSONB,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "libraryLessonId" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'READY',
    "reviewNote" TEXT,
    "importJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" JSONB,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ExerciseQuestion" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "ExerciseQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LibraryLesson" (
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

-- CreateTable
CREATE TABLE "edu"."LibraryExercise" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NORMAL',
    "quizMode" BOOLEAN NOT NULL DEFAULT true,
    "instructions" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB,
    "showAnswers" TEXT NOT NULL DEFAULT 'AFTER_DUE',
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "attemptScoring" TEXT NOT NULL DEFAULT 'BEST',
    "timeLimitMinutes" INTEGER NOT NULL DEFAULT 0,
    "allowReview" BOOLEAN NOT NULL DEFAULT true,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "secureMode" BOOLEAN NOT NULL DEFAULT false,
    "maxViolations" INTEGER NOT NULL DEFAULT 3,
    "orderNo" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LibraryExerciseQuestion" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "LibraryExerciseQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LibraryExerciseSource" (
    "exerciseId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,

    CONSTRAINT "LibraryExerciseSource_pkey" PRIMARY KEY ("exerciseId","lessonId")
);

-- CreateTable
CREATE TABLE "edu"."ImportJob" (
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

-- CreateTable
CREATE TABLE "edu"."QuizAttempt" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "grade" DOUBLE PRECISION,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB,
    "overtime" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ExamViolation" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LessonPostView" (
    "id" TEXT NOT NULL,
    "lessonPostId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPostView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."AssignmentSubmission" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attachments" JSONB,
    "content" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "resubmittedCount" INTEGER NOT NULL DEFAULT 0,
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "autoGraded" BOOLEAN NOT NULL DEFAULT false,
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "extraAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."StudentAnswer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,

    CONSTRAINT "StudentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LessonPlan" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachment" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ScoreWeightConfig" (
    "id" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "txWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "gkWeight" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "ckWeight" DOUBLE PRECISION NOT NULL DEFAULT 3,

    CONSTRAINT "ScoreWeightConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ScoreEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "scoreType" "edu"."ScoreType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."SubjectTermAverage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "averageValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SubjectTermAverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."TimetableVersion" (
    "id" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settings" JSONB,

    CONSTRAINT "TimetableVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."TimetableActivity" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodNo" INTEGER NOT NULL,

    CONSTRAINT "TimetableActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."TimetableSlot" (
    "versionId" TEXT NOT NULL,
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
CREATE TABLE "edu"."ClassPeriodLog" (
    "id" TEXT NOT NULL,
    "timetableSlotId" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "attendanceAbsentCount" INTEGER NOT NULL DEFAULT 0,
    "conductRating" TEXT,
    "note" TEXT,
    "lessonTitle" TEXT,

    CONSTRAINT "ClassPeriodLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ClassPeriodAbsence" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "excused" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClassPeriodAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."EmulationCriteria" (
    "id" TEXT NOT NULL,
    "criteriaName" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EmulationCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ClassEmulationScore" (
    "id" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER,

    CONSTRAINT "ClassEmulationScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LibraryBookTitle" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publisher" TEXT,
    "publishYear" INTEGER,
    "category" TEXT,
    "shelfLocation" TEXT,
    "description" TEXT,
    "isbn" TEXT,
    "totalCopies" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryBookTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LibraryBookCopy" (
    "id" TEXT NOT NULL,
    "bookTitleId" TEXT NOT NULL,
    "copyCode" TEXT NOT NULL,
    "status" "edu"."BookCopyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "condition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryBookCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LibraryLoan" (
    "id" TEXT NOT NULL,
    "loanCode" TEXT,
    "bookCopyId" TEXT,
    "studentId" TEXT NOT NULL,
    "borrowedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "returnedDate" TIMESTAMP(3),
    "status" "edu"."LoanStatus" NOT NULL DEFAULT 'BORROWED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LibraryLoanItem" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "bookCopyId" TEXT NOT NULL,
    "status" "edu"."LoanStatus" NOT NULL DEFAULT 'BORROWED',
    "returnedDate" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryLoanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."YearEndResult" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "overallAverage" DOUBLE PRECISION,
    "reviewStatus" "edu"."ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "absenceDays" INTEGER,
    "evaluation" JSONB,
    "conductRank" TEXT,
    "result" "edu"."PromotionResult" NOT NULL,

    CONSTRAINT "YearEndResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ClassPromotionJob" (
    "id" TEXT NOT NULL,
    "academicYearFromId" TEXT NOT NULL,
    "academicYearToId" TEXT NOT NULL,
    "status" "edu"."PromotionJobStatus" NOT NULL DEFAULT 'PENDING',
    "log" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassPromotionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."SchoolSetting" (
    "id" TEXT NOT NULL DEFAULT 'school',
    "schoolName" TEXT NOT NULL DEFAULT 'EduConnect',
    "logoUrl" TEXT,
    "logoPublicId" TEXT,
    "policy" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ExamEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "status" "edu"."ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ExamPaper" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "grouping" "edu"."ExamGrouping" NOT NULL,
    "roomCount" INTEGER,
    "maxPerRoom" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "excludedStudentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reportMinutes" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ExamRoom" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "roomId" TEXT,

    CONSTRAINT "ExamRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ExamSeat" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "examRoomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "seatNo" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "studentCode" TEXT NOT NULL,
    "className" TEXT NOT NULL,

    CONSTRAINT "ExamSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ExamInvigilation" (
    "examRoomId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ExamInvigilation_pkey" PRIMARY KEY ("examRoomId","teacherId")
);

-- CreateTable
CREATE TABLE "edu"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SYSTEM',
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ParentAccount" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3),
    "mustChangePwd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."StudentAssessment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "outcome" "edu"."AssessmentOutcome",
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "adjustmentReason" TEXT,
    "decisionReference" TEXT,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ClassTransfer" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "fromClassId" TEXT NOT NULL,
    "toClassId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "decisionReference" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."ScoreUnlockRequest" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "status" "edu"."ReviewStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedBy" TEXT,
    "reviewReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreUnlockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."StoredFile" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bucket" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "assignmentId" TEXT,
    "purpose" TEXT NOT NULL,
    "exerciseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."LoginThrottle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "edu"."Job" (
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

-- CreateTable
CREATE TABLE "edu"."ErrorLog" (
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

-- CreateTable
CREATE TABLE "edu"."ParentNotification" (
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

-- CreateTable
CREATE TABLE "edu"."ParentOtp" (
    "id" TEXT NOT NULL,
    "phoneKey" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."SmsLog" (
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

-- CreateTable
CREATE TABLE "edu"."UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "ipMasked" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."TrashItem" (
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

-- CreateTable
CREATE TABLE "edu"."ReminderSent" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderSent_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "edu"."ApiKey" (
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

-- CreateTable
CREATE TABLE "edu"."ApiRequestLog" (
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

-- CreateTable
CREATE TABLE "edu"."StudentYouth" (
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

-- CreateTable
CREATE TABLE "edu"."ApiChange" (
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

-- CreateTable
CREATE TABLE "edu"."ApiIdempotency" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "idemKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_accountId_key" ON "edu"."User"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "edu"."User"("email");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "edu"."ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_actorEmail_idx" ON "edu"."ActivityLog"("actorEmail");

-- CreateIndex
CREATE INDEX "ActivityLog_targetType_createdAt_idx" ON "edu"."ActivityLog"("targetType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_yearName_key" ON "edu"."AcademicYear"("yearName");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicTerm_academicYearId_termName_key" ON "edu"."AcademicTerm"("academicYearId", "termName");

-- CreateIndex
CREATE UNIQUE INDEX "GradeLevel_gradeName_key" ON "edu"."GradeLevel"("gradeName");

-- CreateIndex
CREATE UNIQUE INDEX "Room_roomName_key" ON "edu"."Room"("roomName");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_subjectName_key" ON "edu"."Subject"("subjectName");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_code_key" ON "edu"."Teacher"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_userId_key" ON "edu"."Teacher"("userId");

-- CreateIndex
CREATE INDEX "TeacherSubject_subjectId_idx" ON "edu"."TeacherSubject"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_code_key" ON "edu"."Student"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "edu"."Student"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_memberId_key" ON "edu"."Student"("memberId");

-- CreateIndex
CREATE INDEX "SchoolClass_gradeLevelId_idx" ON "edu"."SchoolClass"("gradeLevelId");

-- CreateIndex
CREATE INDEX "SchoolClass_homeroomTeacherId_idx" ON "edu"."SchoolClass"("homeroomTeacherId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_className_academicYearId_key" ON "edu"."SchoolClass"("className", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_academicYearId_roomId_shift_key" ON "edu"."SchoolClass"("academicYearId", "roomId", "shift");

-- CreateIndex
CREATE INDEX "StudentClassEnrollment_schoolClassId_academicYearId_idx" ON "edu"."StudentClassEnrollment"("schoolClassId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentClassEnrollment_studentId_academicYearId_key" ON "edu"."StudentClassEnrollment"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "ClassSubjectAssignment_teacherId_academicTermId_idx" ON "edu"."ClassSubjectAssignment"("teacherId", "academicTermId");

-- CreateIndex
CREATE INDEX "ClassSubjectAssignment_subjectId_idx" ON "edu"."ClassSubjectAssignment"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSubjectAssignment_schoolClassId_subjectId_academicTerm_key" ON "edu"."ClassSubjectAssignment"("schoolClassId", "subjectId", "academicTermId");

-- CreateIndex
CREATE INDEX "LessonPost_sourceLessonId_idx" ON "edu"."LessonPost"("sourceLessonId");

-- CreateIndex
CREATE INDEX "LessonPost_assignmentId_idx" ON "edu"."LessonPost"("assignmentId");

-- CreateIndex
CREATE INDEX "Exercise_lessonPostId_idx" ON "edu"."Exercise"("lessonPostId");

-- CreateIndex
CREATE INDEX "Question_teacherId_subjectId_archivedAt_idx" ON "edu"."Question"("teacherId", "subjectId", "archivedAt");

-- CreateIndex
CREATE INDEX "Question_libraryLessonId_idx" ON "edu"."Question"("libraryLessonId");

-- CreateIndex
CREATE INDEX "Question_importJobId_idx" ON "edu"."Question"("importJobId");

-- CreateIndex
CREATE INDEX "Question_subjectId_gradeLevelId_idx" ON "edu"."Question"("subjectId", "gradeLevelId");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_idx" ON "edu"."QuestionOption"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseQuestion_exerciseId_questionId_key" ON "edu"."ExerciseQuestion"("exerciseId", "questionId");

-- CreateIndex
CREATE INDEX "LibraryLesson_teacherId_subjectId_gradeLevelId_archivedAt_idx" ON "edu"."LibraryLesson"("teacherId", "subjectId", "gradeLevelId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryExerciseQuestion_exerciseId_questionId_key" ON "edu"."LibraryExerciseQuestion"("exerciseId", "questionId");

-- CreateIndex
CREATE INDEX "ImportJob_teacherId_createdAt_idx" ON "edu"."ImportJob"("teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "QuizAttempt_studentId_idx" ON "edu"."QuizAttempt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttempt_exerciseId_studentId_attemptNo_key" ON "edu"."QuizAttempt"("exerciseId", "studentId", "attemptNo");

-- CreateIndex
CREATE INDEX "ExamViolation_exerciseId_studentId_idx" ON "edu"."ExamViolation"("exerciseId", "studentId");

-- CreateIndex
CREATE INDEX "LessonPostView_studentId_idx" ON "edu"."LessonPostView"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonPostView_lessonPostId_studentId_key" ON "edu"."LessonPostView"("lessonPostId", "studentId");

-- CreateIndex
CREATE INDEX "AssignmentSubmission_studentId_idx" ON "edu"."AssignmentSubmission"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmission_exerciseId_studentId_key" ON "edu"."AssignmentSubmission"("exerciseId", "studentId");

-- CreateIndex
CREATE INDEX "StudentAnswer_questionId_idx" ON "edu"."StudentAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAnswer_submissionId_questionId_key" ON "edu"."StudentAnswer"("submissionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreWeightConfig_academicTermId_key" ON "edu"."ScoreWeightConfig"("academicTermId");

-- CreateIndex
CREATE INDEX "ScoreEntry_studentId_academicTermId_idx" ON "edu"."ScoreEntry"("studentId", "academicTermId");

-- CreateIndex
CREATE INDEX "ScoreEntry_assignmentId_idx" ON "edu"."ScoreEntry"("assignmentId");

-- CreateIndex
CREATE INDEX "SubjectTermAverage_assignmentId_idx" ON "edu"."SubjectTermAverage"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectTermAverage_studentId_assignmentId_academicTermId_key" ON "edu"."SubjectTermAverage"("studentId", "assignmentId", "academicTermId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableVersion_academicTermId_startsOn_key" ON "edu"."TimetableVersion"("academicTermId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableActivity_versionId_schoolClassId_dayOfWeek_periodN_key" ON "edu"."TimetableActivity"("versionId", "schoolClassId", "dayOfWeek", "periodNo");

-- CreateIndex
CREATE INDEX "TimetableSlot_schoolClassId_versionId_idx" ON "edu"."TimetableSlot"("schoolClassId", "versionId");

-- CreateIndex
CREATE INDEX "TimetableSlot_versionId_idx" ON "edu"."TimetableSlot"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_roomId_versionId_dayOfWeek_periodNo_key" ON "edu"."TimetableSlot"("roomId", "versionId", "dayOfWeek", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_assignmentId_versionId_dayOfWeek_periodNo_key" ON "edu"."TimetableSlot"("assignmentId", "versionId", "dayOfWeek", "periodNo");

-- CreateIndex
CREATE INDEX "ClassPeriodLog_schoolClassId_idx" ON "edu"."ClassPeriodLog"("schoolClassId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassPeriodLog_timetableSlotId_logDate_key" ON "edu"."ClassPeriodLog"("timetableSlotId", "logDate");

-- CreateIndex
CREATE INDEX "ClassPeriodAbsence_studentId_idx" ON "edu"."ClassPeriodAbsence"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassPeriodAbsence_logId_studentId_key" ON "edu"."ClassPeriodAbsence"("logId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassEmulationScore_schoolClassId_academicTermId_periodLabe_key" ON "edu"."ClassEmulationScore"("schoolClassId", "academicTermId", "periodLabel");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBookTitle_code_key" ON "edu"."LibraryBookTitle"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBookTitle_isbn_key" ON "edu"."LibraryBookTitle"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBookCopy_copyCode_key" ON "edu"."LibraryBookCopy"("copyCode");

-- CreateIndex
CREATE INDEX "LibraryBookCopy_bookTitleId_idx" ON "edu"."LibraryBookCopy"("bookTitleId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryLoan_loanCode_key" ON "edu"."LibraryLoan"("loanCode");

-- CreateIndex
CREATE INDEX "LibraryLoan_studentId_idx" ON "edu"."LibraryLoan"("studentId");

-- CreateIndex
CREATE INDEX "LibraryLoanItem_loanId_idx" ON "edu"."LibraryLoanItem"("loanId");

-- CreateIndex
CREATE INDEX "LibraryLoanItem_bookCopyId_idx" ON "edu"."LibraryLoanItem"("bookCopyId");

-- CreateIndex
CREATE INDEX "YearEndResult_academicYearId_idx" ON "edu"."YearEndResult"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "YearEndResult_studentId_academicYearId_key" ON "edu"."YearEndResult"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "ExamEvent_academicTermId_gradeLevelId_status_idx" ON "edu"."ExamEvent"("academicTermId", "gradeLevelId", "status");

-- CreateIndex
CREATE INDEX "ExamPaper_startsAt_endsAt_idx" ON "edu"."ExamPaper"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_eventId_subjectId_key" ON "edu"."ExamPaper"("eventId", "subjectId");

-- CreateIndex
CREATE INDEX "ExamRoom_roomId_idx" ON "edu"."ExamRoom"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamRoom_paperId_groupKey_key" ON "edu"."ExamRoom"("paperId", "groupKey");

-- CreateIndex
CREATE INDEX "ExamSeat_studentId_idx" ON "edu"."ExamSeat"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeat_paperId_studentId_key" ON "edu"."ExamSeat"("paperId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeat_paperId_registrationNo_key" ON "edu"."ExamSeat"("paperId", "registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeat_examRoomId_seatNo_key" ON "edu"."ExamSeat"("examRoomId", "seatNo");

-- CreateIndex
CREATE INDEX "ExamInvigilation_teacherId_idx" ON "edu"."ExamInvigilation"("teacherId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "edu"."Notification"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "ParentAccount_phone_key" ON "edu"."ParentAccount"("phone");

-- CreateIndex
CREATE INDEX "ParentAccount_phone_idx" ON "edu"."ParentAccount"("phone");

-- CreateIndex
CREATE INDEX "StudentAssessment_assignmentId_idx" ON "edu"."StudentAssessment"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAssessment_studentId_assignmentId_key" ON "edu"."StudentAssessment"("studentId", "assignmentId");

-- CreateIndex
CREATE INDEX "ClassTransfer_studentId_academicYearId_effectiveAt_idx" ON "edu"."ClassTransfer"("studentId", "academicYearId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ScoreUnlockRequest_assignmentId_requestedBy_status_expiresA_idx" ON "edu"."ScoreUnlockRequest"("assignmentId", "requestedBy", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "edu"."StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "StoredFile_assignmentId_purpose_idx" ON "edu"."StoredFile"("assignmentId", "purpose");

-- CreateIndex
CREATE INDEX "StoredFile_uploadedBy_createdAt_idx" ON "edu"."StoredFile"("uploadedBy", "createdAt");

-- CreateIndex
CREATE INDEX "LoginThrottle_expiresAt_idx" ON "edu"."LoginThrottle"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "edu"."Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "edu"."Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_type_createdAt_idx" ON "edu"."Job"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorLog_fingerprint_key" ON "edu"."ErrorLog"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorLog_status_lastSeenAt_idx" ON "edu"."ErrorLog"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ParentNotification_phoneKey_isRead_idx" ON "edu"."ParentNotification"("phoneKey", "isRead");

-- CreateIndex
CREATE INDEX "ParentNotification_phoneKey_createdAt_idx" ON "edu"."ParentNotification"("phoneKey", "createdAt");

-- CreateIndex
CREATE INDEX "ParentOtp_phoneKey_createdAt_idx" ON "edu"."ParentOtp"("phoneKey", "createdAt");

-- CreateIndex
CREATE INDEX "SmsLog_createdAt_idx" ON "edu"."SmsLog"("createdAt");

-- CreateIndex
CREATE INDEX "SmsLog_phoneHash_createdAt_idx" ON "edu"."SmsLog"("phoneHash", "createdAt");

-- CreateIndex
CREATE INDEX "SmsLog_status_createdAt_idx" ON "edu"."SmsLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserSession_userId_revokedAt_idx" ON "edu"."UserSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "TrashItem_kind_deletedAt_idx" ON "edu"."TrashItem"("kind", "deletedAt");

-- CreateIndex
CREATE INDEX "TrashItem_expiresAt_idx" ON "edu"."TrashItem"("expiresAt");

-- CreateIndex
CREATE INDEX "ReminderSent_createdAt_idx" ON "edu"."ReminderSent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "edu"."ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiRequestLog_keyId_createdAt_idx" ON "edu"."ApiRequestLog"("keyId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_createdAt_idx" ON "edu"."ApiRequestLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiChange_createdAt_idx" ON "edu"."ApiChange"("createdAt");

-- CreateIndex
CREATE INDEX "ApiChange_keyId_createdAt_idx" ON "edu"."ApiChange"("keyId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiChange_entityType_entityId_idx" ON "edu"."ApiChange"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApiIdempotency_createdAt_idx" ON "edu"."ApiIdempotency"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiIdempotency_keyId_idemKey_key" ON "edu"."ApiIdempotency"("keyId", "idemKey");

-- AddForeignKey
ALTER TABLE "edu"."User" ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."AcademicTerm" ADD CONSTRAINT "AcademicTerm_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "edu"."AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "edu"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TeacherSubject" ADD CONSTRAINT "TeacherSubject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "edu"."Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TeacherSubject" ADD CONSTRAINT "TeacherSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu"."Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "edu"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Student" ADD CONSTRAINT "Student_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."SchoolClass" ADD CONSTRAINT "SchoolClass_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "edu"."Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."SchoolClass" ADD CONSTRAINT "SchoolClass_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "edu"."GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."SchoolClass" ADD CONSTRAINT "SchoolClass_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "edu"."AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."SchoolClass" ADD CONSTRAINT "SchoolClass_homeroomTeacherId_fkey" FOREIGN KEY ("homeroomTeacherId") REFERENCES "edu"."Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."SchoolClass" ADD CONSTRAINT "SchoolClass_monitorStudentId_fkey" FOREIGN KEY ("monitorStudentId") REFERENCES "edu"."Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."StudentClassEnrollment" ADD CONSTRAINT "StudentClassEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."StudentClassEnrollment" ADD CONSTRAINT "StudentClassEnrollment_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "edu"."SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."StudentClassEnrollment" ADD CONSTRAINT "StudentClassEnrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "edu"."AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassSubject" ADD CONSTRAINT "ClassSubject_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "edu"."SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassSubject" ADD CONSTRAINT "ClassSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu"."Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_schoolClassId_subjectId_fkey" FOREIGN KEY ("schoolClassId", "subjectId") REFERENCES "edu"."ClassSubject"("schoolClassId", "subjectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "edu"."SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu"."Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "edu"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "edu"."AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LessonPost" ADD CONSTRAINT "LessonPost_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "edu"."ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Exercise" ADD CONSTRAINT "Exercise_lessonPostId_fkey" FOREIGN KEY ("lessonPostId") REFERENCES "edu"."LessonPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Question" ADD CONSTRAINT "Question_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "edu"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Question" ADD CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu"."Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Question" ADD CONSTRAINT "Question_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "edu"."GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Question" ADD CONSTRAINT "Question_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "edu"."Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Question" ADD CONSTRAINT "Question_libraryLessonId_fkey" FOREIGN KEY ("libraryLessonId") REFERENCES "edu"."LibraryLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "edu"."Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExerciseQuestion" ADD CONSTRAINT "ExerciseQuestion_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "edu"."Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExerciseQuestion" ADD CONSTRAINT "ExerciseQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "edu"."Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryLesson" ADD CONSTRAINT "LibraryLesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "edu"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryLesson" ADD CONSTRAINT "LibraryLesson_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu"."Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryLesson" ADD CONSTRAINT "LibraryLesson_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "edu"."GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryExercise" ADD CONSTRAINT "LibraryExercise_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "edu"."LibraryLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryExerciseQuestion" ADD CONSTRAINT "LibraryExerciseQuestion_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "edu"."LibraryExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryExerciseQuestion" ADD CONSTRAINT "LibraryExerciseQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "edu"."Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryExerciseSource" ADD CONSTRAINT "LibraryExerciseSource_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "edu"."LibraryExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryExerciseSource" ADD CONSTRAINT "LibraryExerciseSource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "edu"."LibraryLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ImportJob" ADD CONSTRAINT "ImportJob_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "edu"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ImportJob" ADD CONSTRAINT "ImportJob_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu"."Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ImportJob" ADD CONSTRAINT "ImportJob_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "edu"."GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ImportJob" ADD CONSTRAINT "ImportJob_libraryLessonId_fkey" FOREIGN KEY ("libraryLessonId") REFERENCES "edu"."LibraryLesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."QuizAttempt" ADD CONSTRAINT "QuizAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "edu"."Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."QuizAttempt" ADD CONSTRAINT "QuizAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamViolation" ADD CONSTRAINT "ExamViolation_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "edu"."Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamViolation" ADD CONSTRAINT "ExamViolation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LessonPostView" ADD CONSTRAINT "LessonPostView_lessonPostId_fkey" FOREIGN KEY ("lessonPostId") REFERENCES "edu"."LessonPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LessonPostView" ADD CONSTRAINT "LessonPostView_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "edu"."Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."StudentAnswer" ADD CONSTRAINT "StudentAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "edu"."AssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."StudentAnswer" ADD CONSTRAINT "StudentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "edu"."Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LessonPlan" ADD CONSTRAINT "LessonPlan_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "edu"."ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ScoreWeightConfig" ADD CONSTRAINT "ScoreWeightConfig_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "edu"."AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ScoreEntry" ADD CONSTRAINT "ScoreEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ScoreEntry" ADD CONSTRAINT "ScoreEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "edu"."ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ScoreEntry" ADD CONSTRAINT "ScoreEntry_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "edu"."AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."SubjectTermAverage" ADD CONSTRAINT "SubjectTermAverage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."SubjectTermAverage" ADD CONSTRAINT "SubjectTermAverage_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "edu"."ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."SubjectTermAverage" ADD CONSTRAINT "SubjectTermAverage_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "edu"."AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TimetableVersion" ADD CONSTRAINT "TimetableVersion_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "edu"."AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TimetableActivity" ADD CONSTRAINT "TimetableActivity_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "edu"."TimetableVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TimetableActivity" ADD CONSTRAINT "TimetableActivity_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "edu"."SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TimetableSlot" ADD CONSTRAINT "TimetableSlot_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "edu"."TimetableVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TimetableSlot" ADD CONSTRAINT "TimetableSlot_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "edu"."SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TimetableSlot" ADD CONSTRAINT "TimetableSlot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "edu"."ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TimetableSlot" ADD CONSTRAINT "TimetableSlot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "edu"."Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."TimetableSlot" ADD CONSTRAINT "TimetableSlot_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "edu"."AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassPeriodLog" ADD CONSTRAINT "ClassPeriodLog_timetableSlotId_fkey" FOREIGN KEY ("timetableSlotId") REFERENCES "edu"."TimetableSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassPeriodLog" ADD CONSTRAINT "ClassPeriodLog_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "edu"."SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassPeriodAbsence" ADD CONSTRAINT "ClassPeriodAbsence_logId_fkey" FOREIGN KEY ("logId") REFERENCES "edu"."ClassPeriodLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassPeriodAbsence" ADD CONSTRAINT "ClassPeriodAbsence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassEmulationScore" ADD CONSTRAINT "ClassEmulationScore_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "edu"."SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassEmulationScore" ADD CONSTRAINT "ClassEmulationScore_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "edu"."AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryBookCopy" ADD CONSTRAINT "LibraryBookCopy_bookTitleId_fkey" FOREIGN KEY ("bookTitleId") REFERENCES "edu"."LibraryBookTitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryLoan" ADD CONSTRAINT "LibraryLoan_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "edu"."LibraryBookCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryLoan" ADD CONSTRAINT "LibraryLoan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryLoanItem" ADD CONSTRAINT "LibraryLoanItem_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "edu"."LibraryLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."LibraryLoanItem" ADD CONSTRAINT "LibraryLoanItem_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "edu"."LibraryBookCopy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."YearEndResult" ADD CONSTRAINT "YearEndResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."YearEndResult" ADD CONSTRAINT "YearEndResult_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "edu"."AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamEvent" ADD CONSTRAINT "ExamEvent_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "edu"."AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamEvent" ADD CONSTRAINT "ExamEvent_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "edu"."GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamPaper" ADD CONSTRAINT "ExamPaper_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "edu"."ExamEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamPaper" ADD CONSTRAINT "ExamPaper_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu"."Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamRoom" ADD CONSTRAINT "ExamRoom_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "edu"."ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamRoom" ADD CONSTRAINT "ExamRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "edu"."Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamSeat" ADD CONSTRAINT "ExamSeat_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "edu"."ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamSeat" ADD CONSTRAINT "ExamSeat_examRoomId_fkey" FOREIGN KEY ("examRoomId") REFERENCES "edu"."ExamRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamSeat" ADD CONSTRAINT "ExamSeat_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamInvigilation" ADD CONSTRAINT "ExamInvigilation_examRoomId_fkey" FOREIGN KEY ("examRoomId") REFERENCES "edu"."ExamRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ExamInvigilation" ADD CONSTRAINT "ExamInvigilation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "edu"."Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "edu"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."StudentAssessment" ADD CONSTRAINT "StudentAssessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."StudentAssessment" ADD CONSTRAINT "StudentAssessment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "edu"."ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ClassTransfer" ADD CONSTRAINT "ClassTransfer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "edu"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ApiRequestLog" ADD CONSTRAINT "ApiRequestLog_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "edu"."ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."StudentYouth" ADD CONSTRAINT "StudentYouth_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ApiChange" ADD CONSTRAINT "ApiChange_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "edu"."ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."ApiIdempotency" ADD CONSTRAINT "ApiIdempotency_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "edu"."ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

