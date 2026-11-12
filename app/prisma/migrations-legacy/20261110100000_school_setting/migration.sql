CREATE TABLE "SchoolSetting" (
  "id" TEXT NOT NULL DEFAULT 'school',
  "schoolName" TEXT NOT NULL DEFAULT 'EduConnect',
  "logoUrl" TEXT,
  "logoPublicId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SchoolSetting" ("id","schoolName","updatedAt") VALUES ('school','EduConnect', CURRENT_TIMESTAMP);
