-- API ngoài có GHI: thông tin Đoàn, nhật ký thay đổi (hoàn tác), chống gửi trùng
CREATE TABLE IF NOT EXISTS "StudentYouth" (
  "studentId" TEXT NOT NULL,
  "isMember" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3),
  "branch" TEXT,
  "position" TEXT,
  "note" TEXT,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentYouth_pkey" PRIMARY KEY ("studentId")
);
DO $$ BEGIN
  ALTER TABLE "StudentYouth" ADD CONSTRAINT "StudentYouth_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ApiChange" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revertedAt" TIMESTAMP(3),
  "revertedBy" TEXT,
  CONSTRAINT "ApiChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ApiChange_createdAt_idx" ON "ApiChange"("createdAt");
CREATE INDEX IF NOT EXISTS "ApiChange_keyId_createdAt_idx" ON "ApiChange"("keyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiChange_entityType_entityId_idx" ON "ApiChange"("entityType", "entityId");
DO $$ BEGIN
  ALTER TABLE "ApiChange" ADD CONSTRAINT "ApiChange_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ApiIdempotency" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "idemKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" INTEGER NOT NULL DEFAULT 0,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiIdempotency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiIdempotency_keyId_idemKey_key" ON "ApiIdempotency"("keyId", "idemKey");
CREATE INDEX IF NOT EXISTS "ApiIdempotency_createdAt_idx" ON "ApiIdempotency"("createdAt");
DO $$ BEGIN
  ALTER TABLE "ApiIdempotency" ADD CONSTRAINT "ApiIdempotency_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
