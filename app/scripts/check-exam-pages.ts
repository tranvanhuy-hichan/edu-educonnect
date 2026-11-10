import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { signSessionToken } from "../src/lib/auth/jwt";
import type { Role } from "@prisma/client";

async function check(role: Role, path: string, expected: string) {
  const user = await prisma.user.findFirst({ where: { isActive: true, roles: { has: role } }, include: { teacher: { select: { id: true } }, student: { select: { id: true } } } });
  assert.ok(user, `No active ${role} fixture available`);
  const token = signSessionToken({ userId: user.id, email: user.email, roles: user.roles, teacherId: user.teacher?.id ?? null, studentId: user.student?.id ?? null });
  const response = await fetch(`http://127.0.0.1:3101${path}`, { headers: { Cookie: `educonnect_session=${token}` }, redirect: "manual" });
  assert.equal(response.status, 200, `${role} ${path}`);
  const html = await response.text();
  assert.ok(html.includes(expected), `${role} ${path} missing expected content`);
  if (role === "STUDENT" && path === "/lich-thi") assert.ok(!html.includes('href="/lich-thi/them"'));
  console.log(`Passed: ${role} ${path}`);
}
async function main() {
  await check("ADMIN", "/lich-thi", "Lịch thi");
  await check("ADMIN", "/lich-thi/them", "Tiếp tục: giờ thi &amp; phân phòng");
  await check("ADMIN", "/lich-hoc", "Thời khóa biểu");
  await check("ADMIN", "/lop-hoc/them", "Môn học của lớp");
  await check("ADMIN", "/phan-cong", "Hiện sẵn các môn đã chọn trong thông tin lớp");
  const cls = await prisma.schoolClass.findFirst({ where: { subjects: { some: {} } }, select: { id: true } });
  if (cls) {
    await check("ADMIN", `/lop-hoc/${cls.id}?tab=settings`, 'name="subjectIds"');
    await check("ADMIN", `/lop-hoc/${cls.id}?tab=assignments`, "Môn đã chọn cho lớp");
  }

  await check("STUDENT", "/lich-thi", "Lịch thi của tôi");
  await check("SUBJECT_TEACHER", "/lich-thi", "Tôi coi thi");
  const sampleText = await readFile("/tmp/educonnect-demo-exam.json", "utf8").catch(() => null);
  if (sampleText) {
    const sample = JSON.parse(sampleText) as { id: string; title: string };
    for (const role of ["ADMIN", "STUDENT", "SUBJECT_TEACHER"] as const) {
      const user = await prisma.user.findFirstOrThrow({ where: { isActive: true, roles: { has: role } }, include: { teacher: true, student: true } });
      const cookie = `educonnect_session=${signSessionToken({ userId: user.id, email: user.email, roles: user.roles, teacherId: user.teacher?.id ?? null, studentId: user.student?.id ?? null })}`;
      const response = await fetch(`http://127.0.0.1:3101/lich-thi/${sample.id}/xuat-excel`, { headers: { Cookie: cookie } });
      if (role !== "ADMIN") { assert.equal(response.status, 404, "Sample draft must remain private"); continue; }
      assert.equal(response.status, 200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      assert.equal(workbook.worksheets.length, 5);
      assert.equal(workbook.worksheets[0].rowCount, 7);
      assert.equal(workbook.worksheets.slice(1).reduce((sum, sheet) => sum + sheet.rowCount - 5, 0), 52);
      console.log("Passed: complete demo Excel (4 room lists, 52 subject-candidate seats)");
    }
    await check("ADMIN", `/lich-thi/${sample.id}`, sample.title);
    await check("ADMIN", `/lich-thi/${sample.id}/sua`, "Khối &amp; môn thi");
  }

}
main().finally(() => prisma.$disconnect());
