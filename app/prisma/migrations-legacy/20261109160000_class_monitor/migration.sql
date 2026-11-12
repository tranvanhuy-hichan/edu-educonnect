-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN "monitorStudentId" TEXT;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_monitorStudentId_fkey" FOREIGN KEY ("monitorStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
