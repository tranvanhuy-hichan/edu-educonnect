ALTER TABLE "AcademicTerm"
  ADD COLUMN "gradesHidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gradesHiddenAt" TIMESTAMP(3),
  ADD COLUMN "gradesHiddenBy" TEXT,
  ADD COLUMN "gradesHiddenNote" TEXT;
