-- AlterTable
ALTER TABLE "AssignmentSubmission" ADD COLUMN     "attachments" JSONB;

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bucket" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "exerciseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "StoredFile_assignmentId_purpose_idx" ON "StoredFile"("assignmentId", "purpose");

-- CreateIndex
CREATE INDEX "StoredFile_uploadedBy_createdAt_idx" ON "StoredFile"("uploadedBy", "createdAt");
