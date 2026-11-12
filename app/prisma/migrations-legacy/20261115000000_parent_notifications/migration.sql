-- Thông báo cho phụ huynh (khoá theo 9 số cuối SĐT người giám hộ)
CREATE TABLE IF NOT EXISTS "ParentNotification" (
  "id" TEXT NOT NULL,
  "phoneKey" TEXT NOT NULL,
  "studentId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'SYSTEM',
  "link" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ParentNotification_phoneKey_isRead_idx" ON "ParentNotification"("phoneKey", "isRead");
CREATE INDEX IF NOT EXISTS "ParentNotification_phoneKey_createdAt_idx" ON "ParentNotification"("phoneKey", "createdAt");
