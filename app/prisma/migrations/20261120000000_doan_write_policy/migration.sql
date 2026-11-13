-- Quyền ghi dữ liệu dùng chung của Cổng Đoàn (admin EduConnect đặt). Idempotent.
CREATE TABLE IF NOT EXISTS "edu"."DoanWritePolicy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "years" BOOLEAN NOT NULL DEFAULT true,
    "classes" BOOLEAN NOT NULL DEFAULT true,
    "placement" BOOLEAN NOT NULL DEFAULT true,
    "profiles" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "DoanWritePolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DoanWritePolicy_single_row" CHECK ("id" = 1)
);
INSERT INTO "edu"."DoanWritePolicy"("id") VALUES (1) ON CONFLICT DO NOTHING;
