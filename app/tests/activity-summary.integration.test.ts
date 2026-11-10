import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { contextFor } from "../src/infrastructure/database/unit-of-work";
import { recentActivitySummaries } from "../src/modules/admin/admin.repository";

test("dashboard activity summaries work before audit detail columns are migrated", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const rollback = new Error("rollback schema fixture");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "ActivityLog" DROP COLUMN "beforeData", DROP COLUMN "afterData", DROP COLUMN "reason"');
      const entry = await tx.activityLog.create({
        data: { actorEmail: "summary@example.test", action: "create", targetType: "User", createdAt: new Date("2199-01-01") },
        select: { id: true },
      });
      const rows = await recentActivitySummaries(1, contextFor(tx));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, entry.id);
      assert.equal(rows[0].actorEmail, "summary@example.test");
      assert.equal("beforeData" in rows[0], false);
      throw rollback;
    }), (error) => error === rollback);
  } finally {
    await prisma.$disconnect();
  }
});
