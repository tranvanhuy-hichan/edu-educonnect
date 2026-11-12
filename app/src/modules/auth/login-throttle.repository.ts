import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Shared PostgreSQL counters work across application instances; never store identifiers in cleartext.
export async function consumeLoginAttempt(scope: string, identifier: string): Promise<boolean> {
  if (Math.random() < 0.01) await prisma.$executeRaw`DELETE FROM "edu"."LoginThrottle" WHERE "expiresAt" <= NOW()`;
  const key = createHash("sha256").update(`${scope}:${identifier.trim().toLowerCase()}`).digest("hex");
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "edu"."LoginThrottle" ("key", "count", "expiresAt") VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "LoginThrottle"."expiresAt" <= NOW() THEN 1 ELSE "LoginThrottle"."count" + 1 END,
      "expiresAt" = CASE WHEN "LoginThrottle"."expiresAt" <= NOW() THEN NOW() + INTERVAL '15 minutes' ELSE "LoginThrottle"."expiresAt" END
    RETURNING "count"`;
  return rows[0].count <= 10;
}
