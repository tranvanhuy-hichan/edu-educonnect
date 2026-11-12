-- Xác minh SMS cho phụ huynh + nhật ký SMS
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "ParentAccount" ADD COLUMN IF NOT EXISTS "mustChangePwd" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ParentOtp" (
  "id" TEXT NOT NULL,
  "phoneKey" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentOtp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ParentOtp_phoneKey_createdAt_idx" ON "ParentOtp"("phoneKey", "createdAt");

CREATE TABLE IF NOT EXISTS "SmsLog" (
  "id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "phoneHash" TEXT NOT NULL,
  "phoneMasked" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerCode" TEXT,
  "providerRef" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SmsLog_createdAt_idx" ON "SmsLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SmsLog_phoneHash_createdAt_idx" ON "SmsLog"("phoneHash", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsLog_status_createdAt_idx" ON "SmsLog"("status", "createdAt");
