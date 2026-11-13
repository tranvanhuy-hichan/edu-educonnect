import { PrismaClient } from "@prisma/client";
import { adoptUnionTeacher } from "../src/modules/admin/adopt-union-teacher";
const db = new PrismaClient();
async function main() {
  const usernames = process.argv.filter((a) => a.startsWith("--account=")).map((a) => a.slice("--account=".length));
  if (!usernames.length) throw new Error("Chọn rõ tài khoản bằng --account=username; mặc định chạy thử, --apply để ghi");
  for (const username of usernames) {
    const a = await db.doanUser.findUniqueOrThrow({ where: { username }, select: { id: true, username: true, fullName: true, role: true, status: true, superAdmin: true } });
    if (process.argv.includes("--apply")) {
      const result = await db.$transaction((tx) => adoptUnionTeacher(tx, a.id), { timeout: 30000 });
      console.log(JSON.stringify({ username, status: a.status, created: result.created }));
    } else {
      class DryRun extends Error {}
      let eligible = false;
      try { await db.$transaction(async (tx) => { await adoptUnionTeacher(tx, a.id); eligible = true; throw new DryRun(); }, { timeout: 30000 }); }
      catch (e) { if (!(e instanceof DryRun)) throw e; }
      console.log(JSON.stringify({ username, status: a.status, eligible, dryRun: true }));
    }
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "Migration failed"); process.exitCode=1; }).finally(() => db.$disconnect());
