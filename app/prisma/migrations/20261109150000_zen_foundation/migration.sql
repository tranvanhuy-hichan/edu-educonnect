-- AlterTable
ALTER TABLE "User" ADD COLUMN "mustChangePwd" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "code" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Student_code_key" ON "Student"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_code_key" ON "Teacher"("code");
