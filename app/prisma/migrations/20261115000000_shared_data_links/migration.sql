-- AlterTable
ALTER TABLE "edu"."AcademicYear" ADD COLUMN     "schoolYear" INTEGER;

-- AlterTable
ALTER TABLE "edu"."SchoolClass" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "edu"."SyncSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "emailDomain" TEXT NOT NULL DEFAULT 'doan.local',

    CONSTRAINT "SyncSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu"."SyncIssue" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "detail" TEXT NOT NULL,

    CONSTRAINT "SyncIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncIssue_at_idx" ON "edu"."SyncIssue"("at");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_schoolYear_key" ON "edu"."AcademicYear"("schoolYear");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_academicYearId_departmentId_key" ON "edu"."SchoolClass"("academicYearId", "departmentId");

-- AddForeignKey
ALTER TABLE "edu"."AcademicYear" ADD CONSTRAINT "AcademicYear_schoolYear_fkey" FOREIGN KEY ("schoolYear") REFERENCES "SchoolYear"("startYear") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu"."SchoolClass" ADD CONSTRAINT "SchoolClass_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

