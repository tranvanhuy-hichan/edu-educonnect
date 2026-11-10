-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('SCORE', 'COMMENT');

-- CreateEnum
CREATE TYPE "AssessmentOutcome" AS ENUM ('DAT', 'CHUA_DAT');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "PromotionResult" ADD VALUE 'CHUA_DU_DIEU_KIEN';

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "afterData" JSONB,
ADD COLUMN     "beforeData" JSONB,
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "annualPeriods" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "assessmentType" "AssessmentType" NOT NULL DEFAULT 'SCORE';

-- AlterTable
ALTER TABLE "StudentClassEnrollment" ADD COLUMN     "currentClassSince" TIMESTAMP(3);
ALTER TABLE "StudentClassEnrollment" ALTER COLUMN "currentClassSince" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "YearEndResult" ADD COLUMN     "absenceDays" INTEGER,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "evaluation" JSONB,
ADD COLUMN     "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "submittedBy" TEXT,
ALTER COLUMN "overallAverage" DROP NOT NULL;

-- CreateTable
CREATE TABLE "StudentAssessment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "outcome" "AssessmentOutcome",
    "isExempt" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "adjustmentReason" TEXT,
    "decisionReference" TEXT,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTransfer" (
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
CREATE TABLE "ScoreUnlockRequest" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedBy" TEXT,
    "reviewReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreUnlockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentAssessment_studentId_assignmentId_key" ON "StudentAssessment"("studentId", "assignmentId");

-- CreateIndex
CREATE INDEX "ClassTransfer_studentId_academicYearId_effectiveAt_idx" ON "ClassTransfer"("studentId", "academicYearId", "effectiveAt");

-- CreateIndex
CREATE INDEX "ScoreUnlockRequest_assignmentId_requestedBy_status_expiresA_idx" ON "ScoreUnlockRequest"("assignmentId", "requestedBy", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "StudentAssessment" ADD CONSTRAINT "StudentAssessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAssessment" ADD CONSTRAINT "StudentAssessment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ClassSubjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTransfer" ADD CONSTRAINT "ClassTransfer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Legacy enrollment start dates remain NULL: do not invent historical dates.
-- Existing subject timetables provide a starting estimate. Schools must review the annual plan.
UPDATE "Subject" SET "annualPeriods" = "defaultPeriodsPerWeek" * 35;
