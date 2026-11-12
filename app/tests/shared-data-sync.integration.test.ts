import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/lib/prisma";

/**
 * Đồng bộ dữ liệu dùng chung EduConnect ↔ Cổng thông tin Đoàn (trigger trong migration 20261115000100_shared_data_sync).
 * Mỗi kịch bản chạy trong MỘT transaction rồi rollback: không để lại dữ liệu, không phụ thuộc dữ liệu seed.
 */
const run = process.env.RUN_DATABASE_TESTS === "1";
class Rollback extends Error {}
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
async function inTx(fn: (tx: Tx, cur: number) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      const [{ y }] = await tx.$queryRaw<{ y: number }[]>`SELECT edu.cur_school_year() AS y`;
      await tx.$executeRaw`UPDATE edu."SyncSetting" SET enabled = true WHERE id = 1`;
      await fn(tx, y);
      throw new Rollback();
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
}
const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => day(new Date(Date.parse(iso + "T00:00:00Z") + n * 86400_000));
const uniq = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const issues = (tx: Tx) => tx.syncIssue.count();

async function khktYear(tx: Tx, cur: number) {
  // Cổng Đoàn đặt năm học hiện hành: tuần 1 = 2026-09-07, HK1 18 tuần, cả năm 35 tuần.
  await tx.doanSchoolYear.upsert({ where: { startYear: cur }, update: { week1Start: "2026-09-07", sem1Weeks: 18, totalWeeks: 35 }, create: { startYear: cur, week1Start: "2026-09-07", sem1Weeks: 18, totalWeeks: 35 } });
  return tx.academicYear.findUniqueOrThrow({ where: { schoolYear: cur }, include: { terms: true } });
}
async function khktMember(tx: Tx, did: string, cid: string, name: string, extra: object = {}) {
  const code = `SHT${uniq()}${uniq()}`;
  const user = await tx.doanUser.create({ data: { username: code, passwordHash: "x", fullName: name, role: "MEMBER" } });
  return tx.doanMember.create({ data: { code, userId: user.id, fullName: name, classId: cid, departmentId: did, ...extra } });
}

test("năm học: Cổng Đoàn đổi tuần 1/số tuần → EduConnect đổi năm học và hai học kỳ", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const ay = await khktYear(tx, cur);
    assert.equal(ay.yearName, `${cur}-${cur + 1}`);
    assert.equal(day(ay.startDate), "2026-09-07");
    assert.equal(day(ay.endDate), addDays("2026-09-07", 35 * 7 - 1));
    const hk1 = ay.terms.find((t) => t.termName === "HK1")!, hk2 = ay.terms.find((t) => t.termName === "HK2")!;
    assert.equal(day(hk1.endDate), addDays("2026-09-07", 18 * 7 - 1));
    assert.equal(day(hk2.startDate), addDays("2026-09-07", 18 * 7));
    await tx.doanSchoolYear.update({ where: { startYear: cur }, data: { week1Start: "2026-09-14", sem1Weeks: 17 } });
    const after = await tx.academicYear.findUniqueOrThrow({ where: { schoolYear: cur }, include: { terms: true } });
    assert.equal(day(after.startDate), "2026-09-14");
    assert.equal(day(after.terms.find((t) => t.termName === "HK1")!.endDate), addDays("2026-09-14", 17 * 7 - 1));
    assert.equal(await issues(tx), 0);
  });
});

test("năm học: EduConnect sửa ngày/học kỳ và tạo năm mới → Cổng Đoàn khớp theo", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const ay = await khktYear(tx, cur);
    await tx.academicYear.update({ where: { id: ay.id }, data: { startDate: new Date("2026-09-21T00:00:00Z"), endDate: new Date("2027-05-23T00:00:00Z") } });
    const sy = await tx.doanSchoolYear.findUniqueOrThrow({ where: { startYear: cur } });
    assert.equal(sy.week1Start, "2026-09-21");
    assert.equal(sy.totalWeeks, Math.ceil((Date.parse("2027-05-23") - Date.parse("2026-09-21")) / 86400_000 / 7 + 1 / 7));
    const hk1 = ay.terms.find((t) => t.termName === "HK1")!;
    await tx.academicTerm.update({ where: { id: hk1.id }, data: { endDate: new Date("2027-01-10T00:00:00Z") } });
    assert.equal((await tx.doanSchoolYear.findUniqueOrThrow({ where: { startYear: cur } })).sem1Weeks, Math.ceil((Date.parse("2027-01-10") - Date.parse("2026-09-21") + 86400_000) / 86400_000 / 7));
    const next = await tx.academicYear.create({ data: { yearName: "2031-2032", startDate: new Date("2031-09-01T00:00:00Z"), endDate: new Date("2032-05-31T00:00:00Z") } });
    assert.equal(next.schoolYear, 2031, "tự liên kết theo tên năm học");
    assert.equal((await tx.doanSchoolYear.findUniqueOrThrow({ where: { startYear: 2031 } })).week1Start, "2031-09-01");
    assert.equal(await issues(tx), 0);
  });
});

test("lớp = chi đoàn: Cổng Đoàn tạo/đổi tên chi đoàn → EduConnect có lớp tương ứng", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const ay = await khktYear(tx, cur);
    const name = `10T${uniq()}`;
    const dept = await tx.doanDepartment.create({ data: { name, startYear: cur } });
    const sc = await tx.schoolClass.findFirstOrThrow({ where: { departmentId: dept.id, academicYearId: ay.id }, include: { gradeLevel: true } });
    assert.equal(sc.className, name);
    assert.equal(sc.gradeLevel.gradeName, "Khối 10");
    const renamed = `10T${uniq()}`;
    await tx.doanDepartment.update({ where: { id: dept.id }, data: { name: renamed } });
    assert.equal((await tx.schoolClass.findUniqueOrThrow({ where: { id: sc.id } })).className, renamed);
    const teacher = await tx.doanDepartment.create({ data: { name: `GV${uniq()}`, isTeacher: true } });
    assert.equal(await tx.schoolClass.count({ where: { departmentId: teacher.id } }), 0, "chi đoàn giáo viên không thành lớp");
    const grad = await tx.doanDepartment.create({ data: { name: `12G${uniq()}`, startYear: cur - 2, graduatedAt: new Date() } });
    assert.equal(await tx.schoolClass.count({ where: { departmentId: grad.id } }), 0, "chi đoàn đã ra trường không thành lớp");
    assert.equal(await issues(tx), 0);
  });
});

test("lớp = chi đoàn: EduConnect tạo/đổi tên lớp → Cổng Đoàn có chi đoàn + Class phụ", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const ay = await khktYear(tx, cur);
    const gl = await tx.gradeLevel.upsert({ where: { gradeName: "Khối 11" }, update: {}, create: { gradeName: "Khối 11", sortOrder: 11 } });
    const name = `11T${uniq()}`;
    const sc = await tx.schoolClass.create({ data: { className: name, gradeLevelId: gl.id, academicYearId: ay.id } });
    assert.ok(sc.departmentId, "lớp được gắn chi đoàn");
    const dept = await tx.doanDepartment.findUniqueOrThrow({ where: { id: sc.departmentId! }, include: { classes: true } });
    assert.equal(dept.name, name);
    assert.equal(dept.startYear, cur - 1, "lớp 11 năm hiện hành vào học năm trước");
    assert.equal(dept.isTeacher, false);
    assert.deepEqual(dept.classes.map((c) => [c.name, c.grade]), [[name, 11]]);
    const renamed = `11T${uniq()}`;
    await tx.schoolClass.update({ where: { id: sc.id }, data: { className: renamed } });
    const d2 = await tx.doanDepartment.findUniqueOrThrow({ where: { id: dept.id }, include: { classes: true } });
    assert.equal(d2.name, renamed);
    assert.equal(d2.classes[0].name, renamed);
    // Lớp của năm học cũ không đồng bộ (giữ lịch sử).
    const old = await tx.academicYear.create({ data: { yearName: `${cur - 3}-${cur - 2}`, startDate: new Date("2020-09-01T00:00:00Z"), endDate: new Date("2021-05-31T00:00:00Z") } });
    const oldCls = await tx.schoolClass.create({ data: { className: `10O${uniq()}`, gradeLevelId: gl.id, academicYearId: old.id } });
    assert.equal(oldCls.departmentId, null);
    assert.equal(await issues(tx), 0);
  });
});

test("đoàn viên mới ở Cổng Đoàn → tự thành học sinh EduConnect, được xếp lớp; đổi chi đoàn/họ tên đồng bộ", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const ay = await khktYear(tx, cur);
    const a = await tx.doanDepartment.create({ data: { name: `10A${uniq()}`, startYear: cur } });
    const b = await tx.doanDepartment.create({ data: { name: `10B${uniq()}`, startYear: cur } });
    const ca = await tx.doanClass.create({ data: { name: a.name, grade: 10, departmentId: a.id } });
    const cb = await tx.doanClass.create({ data: { name: b.name, grade: 10, departmentId: b.id } });
    const m = await khktMember(tx, a.id, ca.id, "Nguyễn Văn Thử", { gender: "Nam" });
    const st = await tx.student.findFirstOrThrow({ where: { memberId: m.id }, include: { user: { include: { account: true } }, enrollments: { include: { schoolClass: true } } } });
    assert.equal(st.code, m.code);
    assert.equal(st.fullName, "Nguyễn Văn Thử");
    assert.equal(st.gender, "MALE");
    assert.equal(st.user.accountId, m.userId, "dùng đúng tài khoản của khkt");
    assert.deepEqual(st.user.roles, ["STUDENT"]);
    assert.equal(st.enrollments.length, 1);
    assert.equal(st.enrollments[0].schoolClass.departmentId, a.id);
    assert.equal(st.enrollments[0].academicYearId, ay.id);
    // chuyển chi đoàn ở Cổng Đoàn → xếp lại lớp ở EduConnect
    await tx.doanMember.update({ where: { id: m.id }, data: { departmentId: b.id, classId: cb.id } });
    const e2 = await tx.studentClassEnrollment.findMany({ where: { studentId: st.id }, include: { schoolClass: true } });
    assert.deepEqual(e2.map((e) => e.schoolClass.departmentId), [b.id]);
    // sửa họ tên/giới tính/ngày sinh ở Cổng Đoàn → EduConnect
    await tx.doanMember.update({ where: { id: m.id }, data: { fullName: "Nguyễn Văn Đã Sửa", gender: "Nữ", dateOfBirth: new Date("2010-03-04T00:00:00Z") } });
    const s2 = await tx.student.findUniqueOrThrow({ where: { id: st.id } });
    assert.deepEqual([s2.fullName, s2.gender, day(s2.dob!)], ["Nguyễn Văn Đã Sửa", "FEMALE", "2010-03-04"]);
    // sửa ở EduConnect → Cổng Đoàn
    await tx.student.update({ where: { id: st.id }, data: { fullName: "Nguyễn Văn Sửa Lần Hai", gender: "MALE", dob: new Date("2010-05-06T00:00:00Z") } });
    const m2 = await tx.doanMember.findUniqueOrThrow({ where: { id: m.id } });
    assert.deepEqual([m2.fullName, m2.gender, day(m2.dateOfBirth!)], ["Nguyễn Văn Sửa Lần Hai", "Nam", "2010-05-06"]);
    assert.equal(await issues(tx), 0);
  });
});

test("học sinh tạo ở EduConnect được xếp lớp → thành thanh niên ở Cổng Đoàn; chuyển lớp đồng bộ", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const ay = await khktYear(tx, cur);
    const gl = await tx.gradeLevel.upsert({ where: { gradeName: "Khối 10" }, update: {}, create: { gradeName: "Khối 10", sortOrder: 10 } });
    const c1 = await tx.schoolClass.create({ data: { className: `10E${uniq()}`, gradeLevelId: gl.id, academicYearId: ay.id } });
    const c2 = await tx.schoolClass.create({ data: { className: `10F${uniq()}`, gradeLevelId: gl.id, academicYearId: ay.id } });
    const code = `HS${uniq()}${uniq()}`;
    const acc = await tx.doanUser.create({ data: { username: code, passwordHash: "x", fullName: "Học Sinh EduConnect", role: "EXTERNAL" } });
    const st = await tx.student.create({ data: { code, fullName: "Học Sinh EduConnect", gender: "FEMALE", user: { create: { accountId: acc.id, email: `${code.toLowerCase()}@t.invalid`, roles: ["STUDENT"] } } } });
    assert.equal(await tx.doanMember.count({ where: { userId: acc.id } }), 0, "chưa xếp lớp thì chưa có hồ sơ Đoàn");
    await tx.studentClassEnrollment.create({ data: { studentId: st.id, schoolClassId: c1.id, academicYearId: ay.id } });
    const m = await tx.doanMember.findFirstOrThrow({ where: { userId: acc.id }, include: { user: true } });
    assert.deepEqual([m.code, m.fullName, m.gender, m.isDoanVien, m.departmentId, m.user.role], [code, "Học Sinh EduConnect", "Nữ", false, c1.departmentId, "MEMBER"]);
    assert.equal((await tx.student.findUniqueOrThrow({ where: { id: st.id } })).memberId, m.id);
    const en = await tx.studentClassEnrollment.findFirstOrThrow({ where: { studentId: st.id } });
    await tx.studentClassEnrollment.update({ where: { id: en.id }, data: { schoolClassId: c2.id } });
    assert.equal((await tx.doanMember.findUniqueOrThrow({ where: { id: m.id } })).departmentId, c2.departmentId);
    assert.equal(await issues(tx), 0);
  });
});

test("tài khoản Admin của khkt không bao giờ thành học sinh qua đồng bộ", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const ay = await khktYear(tx, cur);
    const gl = await tx.gradeLevel.upsert({ where: { gradeName: "Khối 10" }, update: {}, create: { gradeName: "Khối 10", sortOrder: 10 } });
    const c = await tx.schoolClass.create({ data: { className: `10X${uniq()}`, gradeLevelId: gl.id, academicYearId: ay.id } });
    const adm = await tx.doanUser.create({ data: { username: `adm${uniq()}`, passwordHash: "x", fullName: "Admin", role: "ADMIN" } });
    await assert.rejects(tx.user.create({ data: { accountId: adm.id, email: `adm${uniq()}@t.invalid`, roles: ["STUDENT"] } }), /chỉ thuộc Cổng thông tin Đoàn/);
    void c;
  });
});

test("công tắc TẮT: không có gì được đồng bộ; lỗi phía Cổng Đoàn không làm hỏng thao tác của khkt", { skip: !run }, async () => {
  // (a) tắt
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE edu."SyncSetting" SET enabled = false WHERE id = 1`;
      const [{ y }] = await tx.$queryRaw<{ y: number }[]>`SELECT edu.cur_school_year() AS y`;
      await tx.doanSchoolYear.upsert({ where: { startYear: y }, update: { week1Start: "2026-09-14" }, create: { startYear: y, week1Start: "2026-09-14", sem1Weeks: 18, totalWeeks: 35 } });
      const dept = await tx.doanDepartment.create({ data: { name: `10Q${uniq()}`, startYear: y } });
      assert.equal(await tx.schoolClass.count({ where: { departmentId: dept.id } }), 0);
      assert.equal(await tx.syncIssue.count(), 0);
      throw new Rollback();
    });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
  // (b) bật + xung đột tên lớp bên EduConnect: chi đoàn vẫn được tạo/đổi ở khkt, lỗi chỉ ghi vào SyncIssue
  await inTx(async (tx, cur) => {
    await khktYear(tx, cur);
    const name = `1${uniq()}X`;
    await tx.doanDepartment.create({ data: { name, startYear: cur - 1 } });          // chi đoàn A (khối 11) → lớp tên `name`
    assert.equal(await tx.schoolClass.count({ where: { className: name } }), 1);
    const b = await tx.doanDepartment.create({ data: { name, startYear: cur } });     // chi đoàn B (khối 10) cùng tên: khkt cho phép (khác khóa)
    assert.ok(b.id, "khkt vẫn tạo được chi đoàn dù EduConnect không tạo nổi lớp trùng tên");
    assert.equal(await tx.schoolClass.count({ where: { departmentId: b.id } }), 0);
    assert.ok((await tx.syncIssue.count()) >= 1, "lỗi đồng bộ được ghi lại");
  });
});

test("đối soát lúc chuyển năm học: EduConnect đã xếp lớp thì thắng; chưa xếp lớp thì theo chi đoàn", { skip: !run }, async () => {
  await inTx(async (tx, cur) => {
    const ay = await khktYear(tx, cur);
    const a = await tx.doanDepartment.create({ data: { name: `10M${uniq()}`, startYear: cur } });
    const b = await tx.doanDepartment.create({ data: { name: `10N${uniq()}`, startYear: cur } });
    const ca = await tx.doanClass.create({ data: { name: a.name, grade: 10, departmentId: a.id } });
    const m1 = await khktMember(tx, a.id, ca.id, "Có Xếp Lớp EduConnect");
    const m2 = await khktMember(tx, a.id, ca.id, "Chưa Xếp Lớp EduConnect");
    // mô phỏng "lên lớp" ở EduConnect đã diễn ra TRƯỚC khi năm học trở thành hiện hành: m1 được xếp sang lớp của chi đoàn B, m2 chưa có xếp lớp
    const s1 = await tx.student.findFirstOrThrow({ where: { memberId: m1.id } });
    const s2 = await tx.student.findFirstOrThrow({ where: { memberId: m2.id } });
    const clsB = await tx.schoolClass.findFirstOrThrow({ where: { departmentId: b.id, academicYearId: ay.id } });
    await tx.$executeRaw`UPDATE edu."SyncSetting" SET enabled = false WHERE id = 1`;     // thay đổi "lặng lẽ" (không kích hoạt trigger)
    await tx.studentClassEnrollment.update({ where: { studentId_academicYearId: { studentId: s1.id, academicYearId: ay.id } }, data: { schoolClassId: clsB.id } });
    await tx.studentClassEnrollment.delete({ where: { studentId_academicYearId: { studentId: s2.id, academicYearId: ay.id } } });
    await tx.$executeRaw`UPDATE edu."SyncSetting" SET enabled = true WHERE id = 1`;
    const [res] = await tx.$queryRaw<{ moved_to_doan: number; enrolled_in_edu: number }[]>`SELECT * FROM edu.sync_reconcile()`;
    assert.deepEqual([res.moved_to_doan, res.enrolled_in_edu], [1, 1]);
    assert.equal((await tx.doanMember.findUniqueOrThrow({ where: { id: m1.id } })).departmentId, b.id, "EduConnect thắng");
    assert.equal((await tx.doanMember.findUniqueOrThrow({ where: { id: m2.id } })).departmentId, a.id);
    assert.equal((await tx.studentClassEnrollment.findFirstOrThrow({ where: { studentId: s2.id } })).schoolClassId, (await tx.schoolClass.findFirstOrThrow({ where: { departmentId: a.id, academicYearId: ay.id } })).id, "Cổng Đoàn lấp chỗ trống");
    const [again] = await tx.$queryRaw<{ moved_to_doan: number; enrolled_in_edu: number }[]>`SELECT * FROM edu.sync_reconcile()`;
    assert.deepEqual([again.moved_to_doan, again.enrolled_in_edu], [0, 0], "chạy lại không làm gì");
    assert.equal(await issues(tx), 0);
  });
});
