-- Khoá API cho hệ thống bên ngoài + nhật ký gọi API
CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" TEXT[],
  "ipAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "rateLimitPerMin" INTEGER NOT NULL DEFAULT 120,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "lastUsedIp" TEXT,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

CREATE TABLE IF NOT EXISTS "ApiRequestLog" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "status" INTEGER NOT NULL,
  "ms" INTEGER NOT NULL,
  "ipMasked" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiRequestLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ApiRequestLog_keyId_createdAt_idx" ON "ApiRequestLog"("keyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiRequestLog_createdAt_idx" ON "ApiRequestLog"("createdAt");
DO $$ BEGIN
  ALTER TABLE "ApiRequestLog" ADD CONSTRAINT "ApiRequestLog_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
