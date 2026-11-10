ALTER TABLE "TimetableVersion" ADD COLUMN "settings" JSONB;
CREATE TABLE "TimetableActivity" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "schoolClassId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "periodNo" INTEGER NOT NULL,
  CONSTRAINT "TimetableActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimetableActivity_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TimetableVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TimetableActivity_schoolClassId_fkey" FOREIGN KEY ("schoolClassId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TimetableActivity_versionId_schoolClassId_dayOfWeek_periodNo_key" ON "TimetableActivity"("versionId", "schoolClassId", "dayOfWeek", "periodNo");
