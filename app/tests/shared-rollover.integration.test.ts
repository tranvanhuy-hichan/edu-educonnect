import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/lib/prisma";

/**
 * Lên lớp theo EduConnect, xoá lan truyền dạng lưu trữ và chặn cứng quyền ghi của Cổng Đoàn
 * (migration 20261119000000_rollover_follow_edu, 20261120000000_doan_write_policy, 20261121000000_shared_delete_and_write_guard).
 * Mỗi kịch bản chạy trong MỘT transaction rồi rollback; chỉ khẳng định trên dữ liệu do chính test tạo (không phụ thuộc seed).
 */
const run = process.env.RUN_DATABASE_TESTS === "1";
class Rollback extends Error {}
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function inTx(fn: (tx: Tx, cur: number) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      const [{ y }] = await tx.$queryRaw<{ y: number }[]>`SELECT edu.cur_school_year() AS y`;
      await fn(tx, y);
      throw new Rollback();
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
}

const q = <T = Record<string, unknown>>(tx: Tx, s: string, ...p: unknown[]) => tx.$queryRawUnsafe<T[]>(s, ...p);
const x = (tx: Tx, s: string, ...p: unknown[]) => tx.$executeRawUnsafe(s, ...p);
const one = async <T = Record<string, unknown>>(tx: Tx, s: string, ...p: unknown[]) => (await q<T>(tx, s, ...p))[0];
const uniq = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const syncOn = (tx: Tx, on: boolean) => x(tx, `UPDATE edu."SyncSetting" SET enabled = $1 WHERE id = 1`, on);

/** Chạy một câu lệnh có thể bị chặn: trả thông báo lỗi (hoặc null nếu thành công) mà không làm hỏng transaction. */
async function attempt(tx: Tx, sql: string): Promise<string | null> {
  await x(tx, "SAVEPOINT attempt");
  try { await x(tx, sql); await x(tx, "RELEASE SAVEPOINT attempt"); return null; }
  catch (e) { await x(tx, "ROLLBACK TO SAVEPOINT attempt"); return String((e as Error).message); }
}

type Fx = ReturnType<typeof build> extends Promise<infer R> ? R : never;

/**
 * Đúng thời điểm sang năm học: ĐÃ có lớp năm hiện hành nhưng chưa nối chi đoàn (đồng bộ tắt lúc dựng dữ liệu rồi bật lại).
 *  năm trước: 10A1 (S1 bí thư, S2 cờ đỏ + lớp phó, đủ lên lớp), 10A2 (S3 lớp trưởng, lưu ban; S5 lên lớp), 12A1 (S4, tốt nghiệp)
 *  năm nay  : 11A1 (S1,S2), 10A2 (S3 lưu ban), 11A2 (S5)
 */
async function build(tx: Tx, cur: number) {
  const t = uniq();
  const id = (s: string) => `${t}${s}`;
  const name = (g: number, s: string) => `${g}T${t}${s}`;
  await syncOn(tx, false);
  for (const y of [cur - 1, cur]) {
    await x(tx, `INSERT INTO public."SchoolYear"("startYear","week1Start") VALUES ($1, $2) ON CONFLICT DO NOTHING`, y, `${y}-09-07`);
    await x(tx, `INSERT INTO edu."AcademicYear"(id,"yearName","startDate","endDate","schoolYear") VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      id(`ay${y}`), `${y}-${y + 1}`, new Date(`${y}-09-05T00:00:00Z`), new Date(`${y + 1}-05-31T00:00:00Z`), y);
    // dữ liệu seed có thể đã có năm học cùng tên nhưng chưa gắn schoolYear
    await x(tx, `UPDATE edu."AcademicYear" SET "schoolYear" = $1 WHERE "yearName" = $2 AND "schoolYear" IS NULL`, y, `${y}-${y + 1}`);
  }
  const prev = (await one<{ id: string }>(tx, `SELECT id FROM edu."AcademicYear" WHERE "schoolYear" = $1`, cur - 1))!.id;
  const now = (await one<{ id: string }>(tx, `SELECT id FROM edu."AcademicYear" WHERE "schoolYear" = $1`, cur))!.id;
  const gl = async (g: number) => (await one<{ g: string }>(tx, `SELECT edu.grade_level_id($1::int) AS g`, g))!.g;
  const g10 = await gl(10), g11 = await gl(11), g12 = await gl(12);

  // chi đoàn + lớp của năm trước (đã nối nhau)
  const dept = [["dA", name(10, "A"), cur - 1, "cA"], ["dB", name(12, "B"), cur - 3, "cB"], ["dC", name(10, "C"), cur - 1, "cC"]] as const;
  for (const [d, n, sy, c] of dept) {
    await x(tx, `INSERT INTO public."Department"(id,name,"startYear","updatedAt") VALUES ($1,$2,$3,now())`, id(d), n, sy);
    await x(tx, `INSERT INTO public."Class"(id,name,grade,"departmentId","updatedAt") VALUES ($1,$2,$3,$4,now())`, id(c), n, 10 + cur - 1 - sy, id(d));
  }
  const old = [["oA", name(10, "A"), g10, "dA"], ["oB", name(12, "B"), g12, "dB"], ["oC", name(10, "C"), g10, "dC"]] as const;
  for (const [c, n, g, d] of old) await x(tx, `INSERT INTO edu."SchoolClass"(id,"className","gradeLevelId","academicYearId","departmentId") VALUES ($1,$2,$3,$4,$5)`, id(c), n, g, prev, id(d));

  // học sinh S1..S5
  const members: [string, string, string, boolean][] = [["1", "dA", "cA", true], ["2", "dA", "cA", true], ["3", "dC", "cC", false], ["4", "dB", "cB", true], ["5", "dC", "cC", false]];
  for (const [i, d, c, doanVien] of members) {
    const role = i === "1" || i === "4" ? "SECRETARY" : i === "2" ? "MONITOR" : "MEMBER";
    await x(tx, `INSERT INTO public."User"(id,"fullName","passwordHash",role,username,"updatedAt") VALUES ($1,$2,'x',$3::"Role",$4,now())`, id(`u${i}`), `HS ${t}${i}`, role, id(`hs${i}`));
    await x(tx, `INSERT INTO public."Member"(id,code,"userId","fullName","departmentId","classId","qrToken","isDoanVien","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      id(`m${i}`), id(`C${i}`), id(`u${i}`), `HS ${t}${i}`, id(d), id(c), id(`q${i}`), doanVien);
    await x(tx, `INSERT INTO edu."User"(id,"accountId",email,"updatedAt") VALUES ($1,$2,$3,now())`, id(`e${i}`), id(`u${i}`), `${id(`u${i}`)}@t.local`);
    await x(tx, `INSERT INTO edu."Student"(id,"userId","memberId",code,"fullName") VALUES ($1,$2,$3,$4,$5)`, id(`s${i}`), id(`e${i}`), id(`m${i}`), id(`C${i}`), `HS ${t}${i}`);
  }
  await x(tx, `UPDATE public."Department" SET "secretaryId" = $1 WHERE id = $2`, id("u1"), id("dA"));
  await x(tx, `UPDATE public."Department" SET "secretaryId" = $1 WHERE id = $2`, id("u4"), id("dB"));
  await x(tx, `INSERT INTO public."DepartmentMonitor"(id,"userId","departmentId") VALUES ($1,$2,$3)`, id("dm2"), id("u2"), id("dA"));
  await x(tx, `UPDATE edu."SchoolClass" SET "monitorStudentId" = $1 WHERE id = $2`, id("s3"), id("oC"));
  await x(tx, `INSERT INTO edu."ClassAcademicDeputy"(id,"schoolClassId","studentId") VALUES ($1,$2,$3)`, id("dep"), id("oA"), id("s2"));
  for (const [e, s, c, y] of [["e1", "s1", "oA", prev], ["e2", "s2", "oA", prev], ["e3", "s3", "oC", prev], ["e4", "s4", "oB", prev], ["e5", "s5", "oC", prev]]) {
    await x(tx, `INSERT INTO edu."StudentClassEnrollment"(id,"studentId","schoolClassId","academicYearId") VALUES ($1,$2,$3,$4)`, id(e), id(s), id(c), y);
  }

  // lớp của năm hiện hành, chưa nối chi đoàn
  const next = [["nA", name(11, "A"), g11], ["nC", name(10, "C"), g10], ["nD", name(11, "D"), g11]] as const;
  for (const [c, n, g] of next) await x(tx, `INSERT INTO edu."SchoolClass"(id,"className","gradeLevelId","academicYearId") VALUES ($1,$2,$3,$4)`, id(c), n, g, now);
  for (const [e, s, c] of [["f1", "s1", "nA"], ["f2", "s2", "nA"], ["f3", "s3", "nC"], ["f5", "s5", "nD"]]) {
    await x(tx, `INSERT INTO edu."StudentClassEnrollment"(id,"studentId","schoolClassId","academicYearId") VALUES ($1,$2,$3,$4)`, id(e), id(s), id(c), now);
  }
  await syncOn(tx, true);
  return { t, id, prev, now, name, g10, g11, g12 };
}

const memberDept = (tx: Tx, mid: string) => one<{ id: string; name: string; startYear: number | null; graduatedAt: Date | null; secretaryId: string | null }>(tx,
  `SELECT d.id, d.name, d."startYear", d."graduatedAt", d."secretaryId" FROM public."Department" d JOIN public."Member" m ON m."departmentId" = d.id WHERE m.id = $1`, mid);
const deptOf = (tx: Tx, cid: string) => one<{ id: string; name: string; startYear: number }>(tx,
  `SELECT d.id, d.name, d."startYear" FROM public."Department" d JOIN edu."SchoolClass" c ON c."departmentId" = d.id WHERE c.id = $1`, cid);
const rollover = (tx: Tx) => one<{ linked: number; moved_to_doan: number; retired: number; graduated: number; unplaced: number }>(tx, `SELECT * FROM edu.sync_rollover()`);
const issueCount = async (tx: Tx, like: string) => Number((await one<{ n: bigint }>(tx, `SELECT count(*) AS n FROM edu."SyncIssue" WHERE source LIKE $1`, like))!.n);

test("lên lớp: lớp năm mới thành chi đoàn mới, đoàn viên + ban cán sự đi theo, chi đoàn cũ đóng, khóa 12 ra trường", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const f = await build(tx, cur);
    const before = await issueCount(tx, "rollover.%");
    const r = await rollover(tx);
    assert.ok(r!.linked >= 3 && r!.moved_to_doan >= 4 && r!.retired >= 2 && r!.graduated >= 1);

    // lớp mới ↔ chi đoàn mới (không phải chi đoàn cũ)
    const dA = await deptOf(tx, f.id("nA")), dC = await deptOf(tx, f.id("nC")), dD = await deptOf(tx, f.id("nD"));
    assert.ok(dA && dC && dD, "mọi lớp năm mới đều có chi đoàn");
    assert.notEqual(dA.id, f.id("dA"));
    assert.equal(dA.name, f.name(11, "A"));
    assert.equal(dA.startYear, cur - 1);
    assert.equal(dC.startYear, cur, "lưu ban: chi đoàn của khóa dưới");

    // đoàn viên theo xếp lớp
    assert.equal((await memberDept(tx, f.id("m1")))!.id, dA.id);
    assert.equal((await memberDept(tx, f.id("m2")))!.id, dA.id);
    assert.equal((await memberDept(tx, f.id("m3")))!.id, dC.id);
    assert.equal((await memberDept(tx, f.id("m5")))!.id, dD.id);

    // ban cán sự đi theo học sinh
    assert.equal((await one<{ s: string | null }>(tx, `SELECT "secretaryId" AS s FROM public."Department" WHERE id = $1`, dA.id))!.s, f.id("u1"), "bí thư sang chi đoàn mới");
    assert.equal((await one<{ role: string }>(tx, `SELECT role::text AS role FROM public."User" WHERE id = $1`, f.id("u1")))!.role, "SECRETARY");
    assert.equal(Number((await one<{ n: bigint }>(tx, `SELECT count(*) AS n FROM public."DepartmentMonitor" WHERE "departmentId" = $1 AND "userId" = $2`, dA.id, f.id("u2")))!.n), 1, "cờ đỏ sang chi đoàn mới");
    assert.equal(Number((await one<{ n: bigint }>(tx, `SELECT count(*) AS n FROM edu."ClassAcademicDeputy" WHERE "schoolClassId" = $1 AND "studentId" = $2`, f.id("nA"), f.id("s2")))!.n), 1, "lớp phó học tập sang lớp mới");
    assert.equal((await one<{ m: string | null }>(tx, `SELECT "monitorStudentId" AS m FROM edu."SchoolClass" WHERE id = $1`, f.id("nC")))!.m, f.id("s3"), "lớp trưởng lưu ban giữ chức ở lớp mới");

    // chi đoàn cũ đóng, khóa cuối cấp ra trường
    for (const d of ["dA", "dB", "dC"]) assert.ok((await one<{ g: Date | null }>(tx, `SELECT "graduatedAt" AS g FROM public."Department" WHERE id = $1`, f.id(d)))!.g, `chi đoàn cũ ${d} đã đóng`);
    const s4 = (await one<{ status: string; ustatus: string }>(tx, `SELECT m.status::text AS status, u.status::text AS ustatus FROM public."Member" m JOIN public."User" u ON u.id = m."userId" WHERE m.id = $1`, f.id("m4")))!;
    assert.equal(s4.status, "GRADUATED");
    assert.equal(s4.ustatus, "LOCKED");
    assert.equal(await issueCount(tx, "rollover.%"), before, "không phát sinh lỗi đồng bộ");

    // chạy lại không đổi gì
    const again = await rollover(tx);
    assert.deepEqual([again!.linked, again!.moved_to_doan, again!.retired, again!.graduated], [0, 0, 0, 0]);
  });
});

test("lên lớp: đoàn viên chưa được xếp lớp → chi đoàn cũ được giữ lại và ghi SyncIssue", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const f = await build(tx, cur);
    await syncOn(tx, false);
    await x(tx, `DELETE FROM edu."StudentClassEnrollment" WHERE id = $1`, f.id("f5")); // S5 chưa có lớp năm mới (thi lại chưa xong…)
    await syncOn(tx, true);
    const before = await issueCount(tx, "rollover.unplaced");
    const r = await rollover(tx);
    assert.ok(r!.unplaced >= 1);
    assert.equal((await one<{ g: Date | null }>(tx, `SELECT "graduatedAt" AS g FROM public."Department" WHERE id = $1`, f.id("dC")))!.g, null, "chi đoàn còn người chưa xếp lớp không bị đóng");
    assert.ok(await issueCount(tx, "rollover.unplaced") > before);
    assert.equal((await memberDept(tx, f.id("m5")))!.id, f.id("dC"));
  });
});

test("xếp lớp muộn (sau khi năm mới đã hiện hành) vẫn giữ bí thư nhờ trigger xếp lớp", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const f = await build(tx, cur);
    await rollover(tx);
    // học sinh S6: bí thư chi đoàn cũ, được xếp lớp năm mới SAU khi đã chuyển năm
    await syncOn(tx, false);
    await x(tx, `INSERT INTO public."Department"(id,name,"startYear","updatedAt") VALUES ($1,$2,$3,now())`, f.id("dZ"), f.name(10, "Z"), cur - 1);
    await x(tx, `INSERT INTO public."Class"(id,name,grade,"departmentId","updatedAt") VALUES ($1,$2,10,$3,now())`, f.id("cZ"), f.name(10, "Z"), f.id("dZ"));
    await x(tx, `INSERT INTO public."User"(id,"fullName","passwordHash",role,username,"updatedAt") VALUES ($1,'HS 6','x','SECRETARY'::"Role",$2,now())`, f.id("u6"), f.id("hs6"));
    await x(tx, `INSERT INTO public."Member"(id,code,"userId","fullName","departmentId","classId","qrToken","isDoanVien","updatedAt") VALUES ($1,$2,$3,'HS 6',$4,$5,$6,true,now())`, f.id("m6"), f.id("C6"), f.id("u6"), f.id("dZ"), f.id("cZ"), f.id("q6"));
    await x(tx, `UPDATE public."Department" SET "secretaryId" = $1 WHERE id = $2`, f.id("u6"), f.id("dZ"));
    await x(tx, `INSERT INTO edu."User"(id,"accountId",email,"updatedAt") VALUES ($1,$2,$3,now())`, f.id("e6"), f.id("u6"), `${f.id("u6")}@t.local`);
    await x(tx, `INSERT INTO edu."Student"(id,"userId","memberId",code,"fullName") VALUES ($1,$2,$3,$4,'HS 6')`, f.id("s6"), f.id("e6"), f.id("m6"), f.id("C6"));
    await syncOn(tx, true);
    await x(tx, `INSERT INTO edu."SchoolClass"(id,"className","gradeLevelId","academicYearId") VALUES ($1,$2,$3,$4)`, f.id("nZ"), f.name(11, "Z"), f.g11, f.now); // trigger tạo chi đoàn
    await x(tx, `INSERT INTO edu."StudentClassEnrollment"(id,"studentId","schoolClassId","academicYearId") VALUES ($1,$2,$3,$4)`, f.id("f6"), f.id("s6"), f.id("nZ"), f.now);
    const d = (await memberDept(tx, f.id("m6")))!;
    const nz = (await deptOf(tx, f.id("nZ")))!;
    assert.equal(d.id, nz.id, "đoàn viên sang chi đoàn của lớp mới");
    assert.equal(d.secretaryId, f.id("u6"), "bí thư đi theo");
  });
});

test("lớp = chi đoàn: xoá lớp → xoá mềm chi đoàn, khôi phục lớp → khôi phục chi đoàn; xoá chi đoàn gắn lớp bị chặn", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const f = await build(tx, cur);
    await rollover(tx);
    const state = (did: string) => one<{ del: Date | null; grad: Date | null; account: string | null }>(tx, `SELECT "deletedAt" AS del, "graduatedAt" AS grad, "accountId" AS account FROM public."Department" WHERE id = $1`, did);

    // tạo lớp → tự tạo chi đoàn
    await x(tx, `INSERT INTO edu."SchoolClass"(id,"className","gradeLevelId","academicYearId") VALUES ($1,$2,$3,$4)`, f.id("z1"), f.name(11, "Y"), f.g11, f.now);
    const dz = (await deptOf(tx, f.id("z1")))!;
    assert.ok(dz, "tạo lớp tự tạo chi đoàn");
    assert.deepEqual(await state(dz.id), { del: null, grad: null, account: null });

    // xoá lớp → chi đoàn bị xoá mềm (vẫn còn dòng dữ liệu, ẩn khỏi danh sách đang học)
    const cls = (await one<{ departmentId: string }>(tx, `SELECT "departmentId" FROM edu."SchoolClass" WHERE id = $1`, f.id("z1")))!;
    await x(tx, `DELETE FROM edu."SchoolClass" WHERE id = $1`, f.id("z1"));
    const gone = (await state(dz.id))!;
    assert.ok(gone.del && gone.grad, "xoá mềm: có deletedAt và graduatedAt");
    assert.equal(gone.del.getTime(), gone.grad.getTime(), "graduatedAt = deletedAt để biết khôi phục thì mở lại");

    // khôi phục lớp (thùng rác tạo lại đúng dòng cũ, kèm departmentId) → chi đoàn được khôi phục
    await x(tx, `INSERT INTO edu."SchoolClass"(id,"className","gradeLevelId","academicYearId","departmentId") VALUES ($1,$2,$3,$4,$5)`, f.id("z1"), f.name(11, "Y"), f.g11, f.now, cls.departmentId);
    assert.deepEqual(await state(dz.id), { del: null, grad: null, account: null }, "khôi phục lớp → khôi phục chi đoàn");

    // tạo lớp trùng tên + khóa với chi đoàn đã xoá mềm → dùng lại chi đoàn đó (không đụng khoá duy nhất)
    await x(tx, `DELETE FROM edu."SchoolClass" WHERE id = $1`, f.id("z1"));
    await x(tx, `INSERT INTO edu."SchoolClass"(id,"className","gradeLevelId","academicYearId") VALUES ($1,$2,$3,$4)`, f.id("z1b"), f.name(11, "Y"), f.g11, f.now);
    assert.equal((await deptOf(tx, f.id("z1b")))!.id, dz.id);
    assert.equal((await state(dz.id))!.del, null);

    // chi đoàn đang gắn với lớp: Cổng Đoàn xoá bị chặn, phải xoá lớp trước
    const err = await attempt(tx, `DELETE FROM public."Department" WHERE id = '${dz.id}'`);
    assert.match(err ?? "", /là lớp của EduConnect\. Hãy xóa lớp ở EduConnect trước/);
    assert.equal(Number((await one<{ n: bigint }>(tx, `SELECT count(*) AS n FROM public."Department" WHERE id = $1`, dz.id))!.n), 1);

    // xoá lớp khi chi đoàn còn đoàn viên đang sinh hoạt: chặn xoá lớp, báo rõ, chi đoàn không đổi
    const dA = (await deptOf(tx, f.id("nA")))!;
    const err2 = await attempt(tx, `DELETE FROM edu."SchoolClass" WHERE id = '${f.id("nA")}'`);
    assert.match(err2 ?? "", /Chi đoàn của lớp .* còn 2 đoàn viên đang sinh hoạt/);
    assert.equal((await state(dA.id))!.del, null);

    // chi đoàn giáo viên (không gắn lớp) xoá như cũ
    await x(tx, `INSERT INTO public."Department"(id,name,"isTeacher","updatedAt") VALUES ($1,$2,true,now())`, f.id("gv"), `GV${f.t}`);
    assert.equal(await attempt(tx, `DELETE FROM public."Department" WHERE id = '${f.id("gv")}'`), null);
  });
});

test("học sinh = đoàn viên: xoá học sinh → xoá mềm đoàn viên, khôi phục học sinh → khôi phục; xoá đoàn viên đang là học sinh bị chặn", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const f = await build(tx, cur);
    await rollover(tx);
    const m = (mid: string) => one<{ status: string; del: Date | null; from: string | null; role: string }>(tx,
      `SELECT m.status::text AS status, m."deletedAt" AS del, m."deletedFromStatus"::text AS from, u.role::text AS role FROM public."Member" m JOIN public."User" u ON u.id = m."userId" WHERE m.id = $1`, mid);
    const student = (sid: string) => one<Record<string, unknown>>(tx, `SELECT * FROM edu."Student" WHERE id = $1`, sid);

    // S1 là bí thư: EduConnect xoá học sinh (thùng rác xoá xếp lớp rồi mới xoá học sinh)
    const dA = (await memberDept(tx, f.id("m1")))!;
    const row = (await student(f.id("s1")))!;
    await x(tx, `DELETE FROM edu."StudentClassEnrollment" WHERE "studentId" = $1`, f.id("s1"));
    await x(tx, `DELETE FROM edu."Student" WHERE id = $1`, f.id("s1"));
    const gone = (await m(f.id("m1")))!;
    assert.ok(gone.del, "đoàn viên bị xoá mềm");
    assert.equal(gone.status, "TRANSFERRED", "đang sinh hoạt → đã chuyển sinh hoạt (ẩn khỏi mọi danh sách đang sinh hoạt)");
    assert.equal(gone.from, "ACTIVE");
    assert.equal(gone.role, "MEMBER", "ban cán sự bị gỡ");
    assert.equal(Number((await one<{ n: bigint }>(tx, `SELECT count(*) AS n FROM public."Department" WHERE id = $1 AND "secretaryId" IS NOT NULL`, dA.id))!.n), 0);

    // khôi phục học sinh (thùng rác tạo lại đúng dòng cũ, kèm memberId) → đoàn viên về trạng thái trước khi xoá
    await x(tx, `INSERT INTO edu."Student"(id,"userId","memberId",code,"fullName") VALUES ($1,$2,$3,$4,$5)`, row.id, row.userId, row.memberId, row.code, row.fullName);
    const back = (await m(f.id("m1")))!;
    assert.deepEqual([back.del, back.status, back.from], [null, "ACTIVE", null]);

    // đoàn viên đã ra trường trước khi xoá: khôi phục giữ nguyên "đã ra trường"
    const grad = (await student(f.id("s4")))!;
    await x(tx, `DELETE FROM edu."StudentClassEnrollment" WHERE "studentId" = $1`, f.id("s4"));
    await x(tx, `DELETE FROM edu."Student" WHERE id = $1`, f.id("s4"));
    assert.equal((await m(f.id("m4")))!.status, "GRADUATED", "không đổi trạng thái khi không còn sinh hoạt");
    assert.ok((await m(f.id("m4")))!.del);
    await x(tx, `INSERT INTO edu."Student"(id,"userId","memberId",code,"fullName") VALUES ($1,$2,$3,$4,$5)`, grad.id, grad.userId, grad.memberId, grad.code, grad.fullName);
    assert.deepEqual([(await m(f.id("m4")))!.status, (await m(f.id("m4")))!.del], ["GRADUATED", null]);

    // Cổng Đoàn xoá đoàn viên đang là học sinh: chặn, phải xoá học sinh ở EduConnect trước
    const err = await attempt(tx, `DELETE FROM public."Member" WHERE id = '${f.id("m2")}'`);
    assert.match(err ?? "", /là học sinh của EduConnect\. Hãy xóa học sinh ở EduConnect trước/);
    assert.ok(await m(f.id("m2")), "đoàn viên vẫn còn");

    // đoàn viên chưa liên kết học sinh xoá như cũ
    await syncOn(tx, false);
    await x(tx, `UPDATE edu."Student" SET "memberId" = NULL WHERE id = $1`, f.id("s3"));
    await syncOn(tx, true);
    assert.equal(await attempt(tx, `DELETE FROM public."Member" WHERE id = '${f.id("m3")}'`), null);
  });
});

test("chặn cứng quyền ghi: vai trò kết nối của Cổng Đoàn bị khoá theo từng nhóm, EduConnect và hàm đồng bộ không bị chặn", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const f = await build(tx, cur);
    const setPolicy = (years: boolean, classes: boolean, placement: boolean, profiles: boolean) =>
      x(tx, `UPDATE edu."DoanWritePolicy" SET years=$1, classes=$2, placement=$3, profiles=$4 WHERE id = 1`, years, classes, placement, profiles);
    const asDoan = (on: boolean) => x(tx, `UPDATE edu."SyncSetting" SET "doanRole" = ${on ? "session_user::text" : "NULL"} WHERE id = 1`);
    const dept = (n: string, extra = "") => `INSERT INTO public."Department"(id,name,"startYear"${extra ? ',"isTeacher"' : ""},"updatedAt") VALUES ('${f.id(n)}','${f.name(10, n)}',${cur}${extra ? `,${extra}` : ""},now())`;

    // Chưa bật chặn cứng (doanRole NULL): khoá hết vẫn ghi được
    await setPolicy(false, false, false, false);
    await asDoan(false);
    assert.equal(await attempt(tx, dept("Q1")), null);

    // Bật cho kết nối hiện tại, mẫu "Cân bằng": profiles mở, còn lại khoá
    await asDoan(true);
    await setPolicy(false, false, false, true);
    assert.match((await attempt(tx, dept("Q2"))) ?? "", /EduConnect quản lý \(classes\)/);
    assert.equal(await attempt(tx, dept("Q3", "true")), null, "chi đoàn giáo viên không phải lớp");
    assert.match((await attempt(tx, `UPDATE public."Department" SET name = 'ZZ${f.t}' WHERE id = '${f.id("dB")}'`)) ?? "", /\(classes\)/);
    assert.equal(await attempt(tx, `UPDATE public."Department" SET description = 'x' WHERE id = '${f.id("dB")}'`), null, "trường riêng của Đoàn");
    assert.match((await attempt(tx, `INSERT INTO public."SchoolYear"("startYear","week1Start") VALUES (2090,'2090-09-05')`)) ?? "", /\(years\)/);
    assert.equal(await attempt(tx, `UPDATE public."Member" SET "fullName" = 'Đổi tên' WHERE id = '${f.id("m1")}'`), null, "profiles mở");
    assert.match((await attempt(tx, `UPDATE public."Member" SET "departmentId" = '${f.id("dB")}' WHERE id = '${f.id("m1")}'`)) ?? "", /\(placement\)/);
    assert.equal(await attempt(tx, `UPDATE public."Member" SET "isDoanVien" = true WHERE id = '${f.id("m1")}'`), null, "dữ liệu riêng của Đoàn");
    assert.match((await attempt(tx, `SELECT * FROM edu.sync_rollover()`)) ?? "", /\(placement\)/, "chặn ngay ở lối vào chuyển năm học");

    // "EduConnect toàn quyền": cả hồ sơ cũng khoá
    await setPolicy(false, false, false, false);
    assert.match((await attempt(tx, `UPDATE public."Member" SET "fullName" = 'Tên khác' WHERE id = '${f.id("m1")}'`)) ?? "", /\(profiles\)/);
    assert.match((await attempt(tx, `DELETE FROM public."Member" WHERE id = '${f.id("m5")}'`)) ?? "", /\(profiles\)/);

    // Hàm đồng bộ (app.syncing) không bị chặn: sync_enrollment cập nhật Member của Cổng Đoàn khi EduConnect xếp lớp
    await x(tx, `SELECT set_config('app.syncing', '1', true)`);
    assert.equal(await attempt(tx, `UPDATE public."Member" SET "fullName" = 'Do hệ thống' WHERE id = '${f.id("m1")}'`), null);
    await x(tx, `SELECT set_config('app.syncing', '', true)`);

    // "Mở": Cổng Đoàn ghi được và vẫn đồng bộ sang EduConnect
    await setPolicy(true, true, true, true);
    assert.equal(await attempt(tx, dept("Q4")), null);
    assert.equal(Number((await one<{ n: bigint }>(tx, `SELECT count(*) AS n FROM edu."SchoolClass" WHERE "className" = $1`, f.name(10, "Q4")))!.n), 1);

    // Đồng bộ tắt: không chặn dù đang khoá
    await setPolicy(false, false, false, false);
    await syncOn(tx, false);
    assert.equal(await attempt(tx, dept("Q5")), null);
  });
});
