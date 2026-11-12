CREATE TABLE "TimetableVersion" (
  "id" TEXT NOT NULL,
  "academicTermId" TEXT NOT NULL,
  "startsOn" TIMESTAMP(3) NOT NULL,
  "endsOn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimetableVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimetableVersion_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TimetableVersion_academicTermId_startsOn_key" ON "TimetableVersion"("academicTermId", "startsOn");
ALTER TABLE "TimetableSlot" ADD COLUMN "versionId" TEXT;
INSERT INTO "TimetableVersion" ("id", "academicTermId", "startsOn")
SELECT 'legacy-' || t."id", t."id", date_trunc('week', t."startDate")
FROM "AcademicTerm" t WHERE EXISTS (SELECT 1 FROM "TimetableSlot" s WHERE s."academicTermId" = t."id");
UPDATE "TimetableSlot" SET "versionId" = 'legacy-' || "academicTermId";
ALTER TABLE "TimetableSlot" ALTER COLUMN "versionId" SET NOT NULL;
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TimetableVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "TimetableSlot_roomId_academicTermId_dayOfWeek_periodNo_key";
DROP INDEX "TimetableSlot_assignmentId_academicTermId_dayOfWeek_periodN_key";
CREATE UNIQUE INDEX "TimetableSlot_roomId_versionId_dayOfWeek_periodNo_key" ON "TimetableSlot"("roomId", "versionId", "dayOfWeek", "periodNo");
CREATE UNIQUE INDEX "TimetableSlot_assignmentId_versionId_dayOfWeek_periodNo_key" ON "TimetableSlot"("assignmentId", "versionId", "dayOfWeek", "periodNo");
-- Legacy data may contain class clashes; services reject new clashes without dropping existing history.
