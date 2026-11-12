ALTER TABLE "ClassPeriodLog" ADD COLUMN "lessonTitle" TEXT;

CREATE TABLE "ClassPeriodAbsence" (
  "id" TEXT NOT NULL,
  "logId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "excused" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ClassPeriodAbsence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClassPeriodAbsence_logId_studentId_key" ON "ClassPeriodAbsence"("logId", "studentId");
ALTER TABLE "ClassPeriodAbsence" ADD CONSTRAINT "ClassPeriodAbsence_logId_fkey" FOREIGN KEY ("logId") REFERENCES "ClassPeriodLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassPeriodAbsence" ADD CONSTRAINT "ClassPeriodAbsence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
