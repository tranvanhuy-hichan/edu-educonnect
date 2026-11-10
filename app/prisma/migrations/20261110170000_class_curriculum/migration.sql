-- CreateTable
CREATE TABLE "ClassSubject" (
    "schoolClassId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,

    CONSTRAINT "ClassSubject_pkey" PRIMARY KEY ("schoolClassId","subjectId")
);

-- AddForeignKey
ALTER TABLE "ClassSubject" ADD CONSTRAINT "ClassSubject_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubject" ADD CONSTRAINT "ClassSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Preserve each existing class's subjects before enforcing membership.
INSERT INTO "ClassSubject" ("schoolClassId", "subjectId")
SELECT DISTINCT "schoolClassId", "subjectId" FROM "ClassSubjectAssignment"
ON CONFLICT DO NOTHING;

ALTER TABLE "ClassSubjectAssignment" ADD CONSTRAINT "ClassSubjectAssignment_schoolClassId_subjectId_fkey" FOREIGN KEY ("schoolClassId", "subjectId") REFERENCES "ClassSubject"("schoolClassId", "subjectId") ON DELETE RESTRICT ON UPDATE CASCADE;

