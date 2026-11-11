-- Hồ sơ giáo viên / học sinh đầy đủ hơn
ALTER TABLE "Teacher"
  ADD COLUMN "gender" TEXT, ADD COLUMN "dob" TIMESTAMP(3), ADD COLUMN "contactEmail" TEXT, ADD COLUMN "address" TEXT,
  ADD COLUMN "idNumber" TEXT, ADD COLUMN "degree" TEXT, ADD COLUMN "startDate" TIMESTAMP(3), ADD COLUMN "note" TEXT;

ALTER TABLE "Student"
  ADD COLUMN "gender" TEXT, ADD COLUMN "birthPlace" TEXT, ADD COLUMN "ethnicity" TEXT, ADD COLUMN "idNumber" TEXT,
  ADD COLUMN "phone" TEXT, ADD COLUMN "contactEmail" TEXT, ADD COLUMN "address" TEXT,
  ADD COLUMN "guardianRelation" TEXT, ADD COLUMN "guardianEmail" TEXT, ADD COLUMN "guardianJob" TEXT, ADD COLUMN "note" TEXT;

-- Môn giáo viên được phụ trách
CREATE TABLE "TeacherSubject" (
  "teacherId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  CONSTRAINT "TeacherSubject_pkey" PRIMARY KEY ("teacherId", "subjectId")
);
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Giữ nguyên dữ liệu cũ: môn đã được phân công thì coi là môn giáo viên phụ trách
INSERT INTO "TeacherSubject" ("teacherId", "subjectId") SELECT DISTINCT "teacherId", "subjectId" FROM "ClassSubjectAssignment" ON CONFLICT DO NOTHING;
