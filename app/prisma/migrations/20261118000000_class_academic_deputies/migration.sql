-- Lớp phó học tập (nhiều người/lớp). Idempotent: an toàn chạy tay trên DB chưa có lịch sử migration.
CREATE TABLE IF NOT EXISTS "edu"."ClassAcademicDeputy" (
    "id" TEXT NOT NULL,
    "schoolClassId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassAcademicDeputy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClassAcademicDeputy_schoolClassId_studentId_key" ON "edu"."ClassAcademicDeputy"("schoolClassId", "studentId");
CREATE INDEX IF NOT EXISTS "ClassAcademicDeputy_studentId_idx" ON "edu"."ClassAcademicDeputy"("studentId");
DO $$ BEGIN
  ALTER TABLE "edu"."ClassAcademicDeputy" ADD CONSTRAINT "ClassAcademicDeputy_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "edu"."SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "edu"."ClassAcademicDeputy" ADD CONSTRAINT "ClassAcademicDeputy_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
