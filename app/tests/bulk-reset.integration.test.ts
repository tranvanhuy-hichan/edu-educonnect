import { testAccount, passwordHashOf } from "./helpers/account";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { bulkResetPasswords, findBulkResetTargets, BULK_RESET_BATCH } from "../src/modules/admin/admin.service";
import { login, resolveSessionIdentity } from "../src/modules/auth/auth.service";
import { credentialTag } from "../src/lib/auth/credential-tag";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });

test("database: bulk password reset targets the chosen classes/roles, forces change, revokes sessions and is admin-only", { skip: !enabled }, async () => {
  process.env.JWT_SECRET ||= "test-secret-only";
  const tag = `bulk${Date.now()}`;
  const mk = async (suffix: string, roles: ("ADMIN" | "SUBJECT_TEACHER" | "STUDENT" | "LIBRARIAN")[], extra: object = {}) =>
    prisma.user.create({ data: { email: `${tag}-${suffix}@test.invalid`, accountId: await testAccount(bcrypt.hashSync("old-pass-1", 4)), roles, ...extra }, include: { teacher: true, student: true } });
  const grade = await prisma.gradeLevel.create({ data: { gradeName: `G-${tag}`, sortOrder: 99 } });
  const year = await prisma.academicYear.create({ data: { yearName: `Y-${tag}`, startDate: new Date(Date.now() - 1000), endDate: new Date(Date.now() + 86400_000 * 300) } });
  const klass = (name: string) => prisma.schoolClass.create({ data: { className: `${name}-${tag}`, gradeLevelId: grade.id, academicYearId: year.id } });
  const [c1, c2] = [await klass("A"), await klass("B")];
  const admin = await mk("admin", ["ADMIN"]);
  const teacher = await mk("gv", ["SUBJECT_TEACHER"], { teacher: { create: { fullName: "Giáo viên Thử", code: `GV${tag.slice(-6)}` } } });
  const lockedTeacher = await mk("gvlock", ["SUBJECT_TEACHER"], { isActive: false });
  const librarian = await mk("tv", ["LIBRARIAN"]);
  const student = async (suffix: string, cls: { id: string }, code: string) => {
    const u = await mk(suffix, ["STUDENT"], { student: { create: { fullName: `HS ${suffix}`, code } } });
    await prisma.studentClassEnrollment.create({ data: { studentId: u.student!.id, schoolClassId: cls.id, academicYearId: year.id } });
    return u;
  };
  const s1 = await student("s1", c1, `HS${tag.slice(-8)}`), s2 = await student("s2", c2, `HT${tag.slice(-8)}`);
  const sys = { userId: admin.id, email: admin.email, roles: ["ADMIN" as const], teacherId: null, studentId: null };
  const created = [admin, teacher, lockedTeacher, librarian, s1, s2].map((u) => u.id);
  try {
    // chỉ giáo viên: có giáo viên đang hoạt động, loại tài khoản khoá và chính người thực hiện
    const staff = await findBulkResetTargets(sys, { roles: ["SUBJECT_TEACHER"], classIds: [], allClasses: false });
    assert.ok(staff.ids.includes(teacher.id));
    assert.ok(!staff.ids.includes(lockedTeacher.id) && !staff.ids.includes(admin.id) && !staff.ids.includes(s1.id));
    // học sinh theo lớp
    const onlyC1 = await findBulkResetTargets(sys, { roles: ["STUDENT"], classIds: [c1.id], allClasses: false });
    assert.deepEqual(onlyC1.ids, [s1.id]);
    const all = await findBulkResetTargets(sys, { roles: ["STUDENT"], classIds: [], allClasses: true });
    assert.ok(all.ids.includes(s1.id) && all.ids.includes(s2.id));
    await assert.rejects(findBulkResetTargets(sys, { roles: ["STUDENT"], classIds: [], allClasses: false }), /Chọn ít nhất một lớp/);
    await assert.rejects(findBulkResetTargets(sys, { roles: [], classIds: [], allClasses: false }), /Chọn ít nhất/);
    // không phải ADMIN thì bị từ chối
    await assert.rejects(findBulkResetTargets({ ...sys, roles: ["PRINCIPAL"] }, { roles: ["STUDENT"], classIds: [], allClasses: true }), /Quản trị hệ thống/);
    await assert.rejects(bulkResetPasswords({ ...sys, roles: ["SUBJECT_TEACHER"] }, [s1.id]), /Quản trị hệ thống/);

    // chạy thật
    const oldTag = credentialTag(await passwordHashOf(s1.id));
    const rows = await bulkResetPasswords(sys, [s1.id, teacher.id, admin.id, lockedTeacher.id]);
    assert.equal(rows.length, 2, "bỏ qua chính mình và tài khoản khoá");
    const byUser = Object.fromEntries(rows.map((r) => [r.username, r]));
    const sRow = byUser[s1.student!.code!];
    assert.equal(sRow.className, `A-${tag}`);
    assert.equal(sRow.fullName, "HS s1");
    assert.ok(sRow.password.length >= 8);
    assert.notEqual(sRow.password, rows.find((r) => r !== sRow)!.password, "mỗi người một mật khẩu riêng");
    const mustChange = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { account: { select: { mustChangePassword: true } } } })).account.mustChangePassword;
    assert.equal(await mustChange(s1.id), true);
    assert.equal(await resolveSessionIdentity(s1.id, oldTag), null, "phiên cũ mất hiệu lực");
    assert.equal(await mustChange(admin.id), false, "người thực hiện không bị đổi");
    assert.equal(await mustChange(lockedTeacher.id), false);
    // đăng nhập được bằng mật khẩu mới (mã học sinh), bị buộc đổi, mật khẩu cũ không còn dùng được
    const session = await login({ email: s1.student!.code!, password: sRow.password });
    assert.equal(session.userId, s1.id);
    assert.equal((await resolveSessionIdentity(s1.id, session.credentialTag))!.mustChangePwd, true);
    await assert.rejects(login({ email: s1.student!.code!, password: "old-pass-1" }));
    assert.equal(await prisma.activityLog.count({ where: { action: "reset_password", targetId: { in: [s1.id, teacher.id] } } }), 2);
    // lô quá lớn bị từ chối
    await assert.rejects(bulkResetPasswords(sys, Array.from({ length: BULK_RESET_BATCH + 1 }, (_, i) => `x${i}`)), /tối đa/);
  } finally {
    await prisma.activityLog.deleteMany({ where: { targetId: { in: created } } });
    await prisma.studentClassEnrollment.deleteMany({ where: { academicYearId: year.id } });
    await prisma.student.deleteMany({ where: { userId: { in: created } } });
    await prisma.teacher.deleteMany({ where: { userId: { in: created } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.schoolClass.deleteMany({ where: { academicYearId: year.id } });
    await prisma.academicYear.delete({ where: { id: year.id } });
    await prisma.gradeLevel.delete({ where: { id: grade.id } });
  }
});
