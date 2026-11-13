import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
const run = process.env.RUN_DATABASE_TESTS === "1";
class Rollback extends Error {}
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const unique = () => `staff${crypto.randomUUID().replaceAll("-", "")}`;
after(async () => prisma.$disconnect());
async function inTx(fn: (tx: Tx) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      // Test the migration before deployment: all DDL and fixtures roll back together.
      if (process.env.TEST_PERSONNEL_MIGRATION === "1") {
        const sql = readFileSync(new URL("../prisma/migrations/20261116000000_shared_personnel_officers/migration.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
        let start = 0, body = false;
        for (let i = 0; i < sql.length; i++) {
          if (sql.slice(i, i + 2) === "$$") { body = !body; i++; }
          else if (sql[i] === ";" && !body) { await tx.$executeRawUnsafe(sql.slice(start, i + 1)); start = i + 1; }
        }
      }
      await fn(tx); throw new Rollback();
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
}
async function account(tx: Tx, role: "ADMIN" | "EXTERNAL" | "MEMBER" = "EXTERNAL", superAdmin = false) {
  return tx.doanUser.create({ data: { username: unique(), passwordHash: "test-only", fullName: "Kiểm thử", role, superAdmin } });
}
async function edu(tx: Tx, roles: ("ADMIN" | "SUBJECT_TEACHER" | "STUDENT")[] = ["SUBJECT_TEACHER"]) {
  return tx.user.create({ data: { email: `${unique()}@test.invalid`, accountId: (await account(tx)).id, roles } });
}
async function refused(tx: Tx, fn: () => Promise<unknown>) {
  await tx.$executeRawUnsafe("SAVEPOINT must_refuse"); let error = false;
  try { await fn(); } catch { error = true; }
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT must_refuse"); assert.equal(error, true);
}
test("personnel: appoint/revoke from either app keeps the shared password, identity and Edu permissions", { skip: !run }, async () => inTx(async (tx) => {
  const actor = await edu(tx, ["ADMIN"]), doan = await account(tx, "ADMIN", true), target = await edu(tx);
  await tx.teacher.create({ data: { userId: target.id, fullName: "Giáo viên BCH" } });
  for (const [source, id] of [["edu", actor.id], ["doan", doan.id]]) {
    await tx.$queryRaw`SELECT 1 FROM edu.assign_union_leader(${source}, ${id}, ${target.accountId}, 'Bí thư Đoàn trường')`;
    const u = await tx.user.findUniqueOrThrow({ where: { id: target.id }, include: { account: true } });
    assert.deepEqual(u.roles, ["SUBJECT_TEACHER"]); assert.equal(u.account.role, "ADMIN"); assert.equal(u.account.superAdmin, false); assert.equal(u.account.passwordHash, "test-only");
    await tx.$queryRaw`SELECT 1 FROM edu.assign_union_leader(${source}, ${id}, ${target.accountId}, NULL)`;
    const a = await tx.doanUser.findUniqueOrThrow({ where: { id: target.accountId } });
    assert.equal(a.role, "EXTERNAL"); assert.equal(a.status, "ACTIVE"); assert.equal(a.position, null);
  }
}));
test("personnel: refuse students, nonteachers, superadmin and unauthorized actors; reverse role update is guarded", { skip: !run }, async () => inTx(async (tx) => {
  const actor = await edu(tx, ["ADMIN"]), student = await edu(tx, ["STUDENT"]), teacher = await edu(tx), sa = await account(tx, "ADMIN", true);
  await tx.teacher.create({ data: { userId: teacher.id, fullName: "Giáo viên" } });
  for (const id of [student.accountId, actor.accountId, sa.id]) await refused(tx, () => tx.$queryRaw`SELECT 1 FROM edu.assign_union_leader('edu', ${actor.id}, ${id}, 'Bí thư')`);
  await refused(tx, () => tx.$queryRaw`SELECT 1 FROM edu.assign_union_leader('edu', ${teacher.id}, ${teacher.accountId}, 'Bí thư')`);
  await refused(tx, () => tx.$queryRaw`SELECT 1 FROM edu.assign_union_leader('doan', ${teacher.accountId}, ${teacher.accountId}, 'Bí thư')`);
  await refused(tx, () => tx.doanUser.update({ where: { id: student.accountId }, data: { role: "ADMIN" } }));
}));
test("class offices: both entry points change shared designations, preserve STUDENT and clear offices on transfer", { skip: !run }, async () => inTx(async (tx) => {
  const actor = await edu(tx, ["ADMIN"]), doan = await account(tx, "ADMIN", true);
  await tx.$executeRaw`UPDATE edu."SyncSetting" SET enabled=true WHERE id=1`;
  const [{ y }] = await tx.$queryRaw<{ y: number }[]>`SELECT edu.cur_school_year() y`;
  await tx.doanSchoolYear.upsert({ where: { startYear: y }, update: {}, create: { startYear: y, week1Start: `${y}-09-07`, sem1Weeks: 18, totalWeeks: 35 } });
  const d = await tx.doanDepartment.create({ data: { name: `10${unique()}`, startYear: y } });
  const c = await tx.doanClass.create({ data: { name: d.name, departmentId: d.id } });
  const a = await account(tx, "MEMBER");
  const m = await tx.doanMember.create({ data: { userId: a.id, code: unique(), fullName: "Học sinh", departmentId: d.id, classId: c.id, isDoanVien: true } });
  const s = await tx.student.findUniqueOrThrow({ where: { memberId: m.id } });
  for (const [source, id] of [["edu", actor.id], ["doan", doan.id]]) {
    await tx.$queryRaw`SELECT 1 FROM edu.assign_class_officer(${source}, ${id}, ${d.id}, 'SECRETARY', ${m.id}, false)`;
    assert.equal((await tx.doanDepartment.findUniqueOrThrow({ where: { id: d.id } })).secretaryId, a.id);
    await refused(tx, () => tx.$queryRaw`SELECT 1 FROM edu.assign_class_officer(${source}, ${id}, ${d.id}, 'RED_MONITOR', ${m.id}, false)`);
    await tx.$queryRaw`SELECT 1 FROM edu.assign_class_officer(${source}, ${id}, ${d.id}, 'SECRETARY', NULL, true)`;
    await tx.$queryRaw`SELECT 1 FROM edu.assign_class_officer(${source}, ${id}, ${d.id}, 'RED_MONITOR', ${m.id}, false)`;
    assert.equal((await tx.doanUser.findUniqueOrThrow({ where: { id: a.id } })).role, "MONITOR");
    await tx.$queryRaw`SELECT 1 FROM edu.assign_class_officer(${source}, ${id}, ${d.id}, 'RED_MONITOR', ${m.id}, true)`;
    await tx.$queryRaw`SELECT 1 FROM edu.assign_class_officer(${source}, ${id}, ${d.id}, 'PRESIDENT', ${m.id}, false)`;
    assert.equal(await tx.schoolClass.count({ where: { departmentId: d.id, monitorStudentId: s.id } }), 1);
    assert.equal((await tx.doanDepartment.findUniqueOrThrow({where:{id:d.id}})).presidentId,a.id);
    await tx.doanDepartment.update({where:{id:d.id},data:{presidentId:null}});
    assert.equal(await tx.schoolClass.count({where:{departmentId:d.id,monitorStudentId:s.id}}),0);
    await tx.doanDepartment.update({where:{id:d.id},data:{presidentId:a.id}});
    assert.equal(await tx.schoolClass.count({where:{departmentId:d.id,monitorStudentId:s.id}}),1);
    assert.deepEqual((await tx.user.findUniqueOrThrow({ where: { id: s.userId } })).roles, ["STUDENT"]);
  }
  await refused(tx, () => tx.$queryRaw`SELECT 1 FROM edu.assign_class_officer('edu', ${s.userId}, ${d.id}, 'SECRETARY', ${m.id}, false)`);
  await tx.$queryRaw`SELECT 1 FROM edu.assign_class_officer('edu', ${actor.id}, ${d.id}, 'SECRETARY', ${m.id}, false)`;
  const next = await tx.doanDepartment.create({ data: { name: `10${unique()}`, startYear: y } });
  const nc = await tx.doanClass.create({ data: { name: next.name, departmentId: next.id } });
  await tx.doanMember.update({ where: { id: m.id }, data: { departmentId: next.id, classId: nc.id } });
  assert.equal((await tx.doanDepartment.findUniqueOrThrow({ where: { id: d.id } })).secretaryId, null);
  assert.equal((await tx.doanUser.findUniqueOrThrow({ where: { id: a.id } })).role, "MEMBER");
  assert.equal(await tx.schoolClass.count({ where: { monitorStudentId: s.id } }), 0);
}));
