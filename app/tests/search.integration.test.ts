import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { searchEverything } from "../src/modules/search/search.service";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });

test("database: global search returns real records scoped to the caller's role", { skip: !enabled }, async () => {
  const tag = `zq${Date.now().toString(36)}`;
  const grade = await prisma.gradeLevel.create({ data: { gradeName: `G-${tag}`, sortOrder: 98 } });
  const year = await prisma.academicYear.create({ data: { yearName: `Y-${tag}`, startDate: new Date(Date.now() - 1000), endDate: new Date(Date.now() + 86400_000 * 300) } });
  const klass = await prisma.schoolClass.create({ data: { className: `L${tag}`, gradeLevelId: grade.id, academicYearId: year.id } });
  const su = await prisma.user.create({ data: { email: `${tag}-hs@test.invalid`, passwordHash: "x", roles: ["STUDENT"], student: { create: { fullName: `Nguyễn ${tag} Học`, code: `HS${tag}` } } }, include: { student: true } });
  await prisma.studentClassEnrollment.create({ data: { studentId: su.student!.id, schoolClassId: klass.id, academicYearId: year.id } });
  const tu = await prisma.user.create({ data: { email: `${tag}-gv@test.invalid`, passwordHash: "x", roles: ["SUBJECT_TEACHER"], teacher: { create: { fullName: `Trần ${tag} Giáo`, code: `GV${tag}` } } }, include: { teacher: true } });
  const as = (roles: ("ADMIN" | "PRINCIPAL" | "SUBJECT_TEACHER" | "STUDENT" | "LIBRARIAN")[]) => ({ userId: "u", email: "u@test.invalid", roles, teacherId: null, studentId: null });
  const keys = (gs: Awaited<ReturnType<typeof searchEverything>>) => gs.map((g) => g.key).sort();
  try {
    const admin = await searchEverything(as(["ADMIN"]), tag.toUpperCase()); // không phân biệt hoa thường
    assert.deepEqual(keys(admin), ["accounts", "classes", "students", "teachers"]);
    const student = admin.find((g) => g.key === "students")!.items[0];
    assert.equal(student.label, `Nguyễn ${tag} Học`);
    assert.match(student.sub, new RegExp(`HS${tag}.*lớp L${tag}`, "i"));
    assert.equal(student.href, `/hoc-sinh/${su.student!.id}`);
    assert.equal(admin.find((g) => g.key === "classes")!.items[0].href, `/lop-hoc/${klass.id}`);
    // Hiệu trưởng: không thấy danh sách tài khoản (chỉ ADMIN)
    assert.deepEqual(keys(await searchEverything(as(["PRINCIPAL"]), tag)), ["classes", "students", "teachers"]);
    // Giáo viên: không thấy học sinh và tài khoản
    assert.deepEqual(keys(await searchEverything(as(["SUBJECT_TEACHER"]), tag)), ["classes", "teachers"]);
    // Học sinh / thủ thư: không có gì
    assert.deepEqual(await searchEverything(as(["STUDENT"]), tag), []);
    assert.deepEqual(await searchEverything(as(["LIBRARIAN"]), tag), []);
    // quá ngắn / không khớp
    assert.deepEqual(await searchEverything(as(["ADMIN"]), "z"), []);
    assert.deepEqual(await searchEverything(as(["ADMIN"]), `${tag}-khong-co-that`), []);
    // tìm theo mã và email
    assert.ok((await searchEverything(as(["ADMIN"]), `GV${tag}`)).some((g) => g.key === "teachers"));
    assert.ok((await searchEverything(as(["ADMIN"]), `${tag}-hs@test`)).some((g) => g.key === "accounts"));
  } finally {
    await prisma.studentClassEnrollment.deleteMany({ where: { academicYearId: year.id } });
    await prisma.student.deleteMany({ where: { userId: su.id } });
    await prisma.teacher.deleteMany({ where: { userId: tu.id } });
    await prisma.user.deleteMany({ where: { id: { in: [su.id, tu.id] } } });
    await prisma.schoolClass.deleteMany({ where: { academicYearId: year.id } });
    await prisma.academicYear.delete({ where: { id: year.id } });
    await prisma.gradeLevel.delete({ where: { id: grade.id } });
  }
});
