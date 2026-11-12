ALTER TABLE "ExamEvent" ADD COLUMN "publishedAt" TIMESTAMP(3), ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
UPDATE "ExamEvent" SET "publishedAt" = "updatedAt" WHERE "status" = 'PUBLISHED';
