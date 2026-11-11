"use server";
import { moveStudent } from "@/modules/academic/transfers";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { MANAGER_ROLES, assertRole } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { parseDate } from "@/lib/format";
import { audit } from "@/lib/audit";
import { getPolicy } from "@/lib/policy";
import { createStudentWithAccount } from "@/server/students";
import { resetPassword } from "@/server/accounts";

function readStudent(fd: FormData) {
  const fullName = str(fd, "fullName");
  if (fullName.length < 2) throw new Error("Nhập họ tên học sinh");
  const dobStr = str(fd, "dob");
  const dob = dobStr ? parseDate(dobStr) : null;
  if (dob && Number.isNaN(dob.getTime())) throw new Error("Ngày sinh không hợp lệ");
  const email = opt(fd, "email");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email không hợp lệ");
  const gp = opt(fd, "guardianPhone")?.replace(/\s/g, "") ?? null;
  if (gp && !/^[0-9+]{8,15}$/.test(gp)) throw new Error("SĐT phụ huynh không hợp lệ");
  const gender = opt(fd, "gender");
  if (gender && !["MALE", "FEMALE", "OTHER"].includes(gender)) throw new Error("Giới tính không hợp lệ");
  const phone = opt(fd, "phone")?.replace(/\s/g, "") ?? null;
  if (phone && !/^[0-9+]{8,15}$/.test(phone)) throw new Error("SĐT học sinh không hợp lệ");
  const contactEmail = opt(fd, "contactEmail"), guardianEmail = opt(fd, "guardianEmail");
  for (const e of [contactEmail, guardianEmail]) if (e && !/^\S+@\S+\.\S+$/.test(e)) throw new Error("Email không hợp lệ");
  return {
    fullName, dob, email, guardianName: opt(fd, "guardianName"), guardianPhone: gp,
    gender, phone, contactEmail, guardianEmail, birthPlace: opt(fd, "birthPlace"), ethnicity: opt(fd, "ethnicity"), idNumber: opt(fd, "idNumber"),
    address: opt(fd, "address"), guardianRelation: opt(fd, "guardianRelation"), guardianJob: opt(fd, "guardianJob"), note: opt(fd, "note"),
  };
}

export const createStudent = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const c = await createStudentWithAccount(readStudent(fd));
  const classId = str(fd, "classId");
  let extra = "";
  if (classId) {
    const cls = await db.schoolClass.findUnique({ where: { id: classId } });
    const s = await db.student.findUniqueOrThrow({ where: { code: c.code } });
    if (cls && (await db.studentClassEnrollment.count({ where: { schoolClassId: classId } })) < (await getPolicy()).promotion.classCapacity) {
      await db.studentClassEnrollment.create({ data: { studentId: s.id, schoolClassId: classId, academicYearId: cls.academicYearId } });
      extra = ` · đã xếp lớp ${cls.className}`;
    } else extra = " · lớp đã đủ sĩ số, chưa xếp lớp";
  }
  await audit(me.email, "create_student", "Student", c.code);
  revalidatePath("/hoc-sinh");
  return { ok: `Đã tạo học sinh${extra}. File mật khẩu ban đầu đang tự tải về.`, data: { credentials: JSON.stringify([{ fullName: c.fullName, username: c.email, password: c.password }]) } };
});

export const updateStudent = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const id = str(fd, "id");
  const d = readStudent(fd);
  await db.student.update({ where: { id }, data: { fullName: d.fullName, dob: d.dob, guardianName: d.guardianName, guardianPhone: d.guardianPhone, gender: d.gender, phone: d.phone, contactEmail: d.contactEmail, guardianEmail: d.guardianEmail, birthPlace: d.birthPlace, ethnicity: d.ethnicity, idNumber: d.idNumber, address: d.address, guardianRelation: d.guardianRelation, guardianJob: d.guardianJob, note: d.note } });
  await audit(me.email, "update_student", "Student", id);
  revalidatePath(`/hoc-sinh/${id}`); revalidatePath("/hoc-sinh");
});

export const toggleLocked = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const id = str(fd, "id");
  const s = await db.student.findUniqueOrThrow({ where: { id }, include: { user: true } });
  await db.user.update({ where: { id: s.userId }, data: { isActive: !s.user.isActive } });
  await audit(me.email, s.user.isActive ? "lock_student" : "unlock_student", "Student", id);
  revalidatePath(`/hoc-sinh/${id}`); revalidatePath("/hoc-sinh");
});

export const resetStudentPassword = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const s = await db.student.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { user: true } });
  const pw = await resetPassword(s.userId);
  await audit(me.email, "reset_password", "Student", s.id);
  return `Tài khoản ${s.user.email} · mật khẩu mới: ${pw}`;
});

/** Cấp lại mật khẩu cả lớp, trả danh sách để in. */
export const classAccounts = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const classId = str(fd, "classId");
  const enr = await db.studentClassEnrollment.findMany({ where: { schoolClassId: classId }, include: { student: { include: { user: true } } } });
  const rows: string[] = [];
  for (const e of enr) rows.push(`${e.student.fullName}\t${e.student.user.email}\t${await resetPassword(e.student.userId)}`);
  await audit(me.email, "class_accounts", "SchoolClass", classId);
  return `Danh sách (Tên | Tài khoản | Mật khẩu) — hãy sao chép và in:\n${rows.join("\n")}`;
});

export const setStudentClass = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const studentId = str(fd, "studentId"), classId = str(fd, "classId");
  if (!classId) throw new Error("Chọn lớp");
  const cls = await db.schoolClass.findUniqueOrThrow({ where: { id: classId } });
  await moveStudent(me, { studentId, targetClassId: classId, effectiveDate: str(fd, "effectiveDate"), reason: str(fd, "reason"), decisionReference: str(fd, "decisionReference") });
  revalidatePath(`/hoc-sinh/${studentId}`); revalidatePath("/hoc-sinh"); revalidatePath(`/lop-hoc/${classId}`);
  return `Đã xếp vào lớp ${cls.className}`;
});

export const deleteStudent = wrap(async (fd) => {
  const me = await assertRole("ADMIN");
  const id = str(fd, "id");
  const [scores, loans, subs] = await Promise.all([db.scoreEntry.count({ where: { studentId: id } }), db.libraryLoan.count({ where: { studentId: id } }), db.assignmentSubmission.count({ where: { studentId: id } })]);
  if (await db.examSeat.count({ where: { studentId: id } })) throw new Error("Học sinh có tên trong lịch thi, hãy khóa tài khoản thay vì xóa hồ sơ");
  if (scores || loans || subs) throw new Error("Học sinh đã có điểm/mượn sách/bài nộp, hãy dùng 'Khóa tài khoản'");
  const s = await db.student.findUniqueOrThrow({ where: { id } });
  await db.$transaction([
    db.studentClassEnrollment.deleteMany({ where: { studentId: id } }), db.lessonPostView.deleteMany({ where: { studentId: id } }),
    db.subjectTermAverage.deleteMany({ where: { studentId: id } }), db.yearEndResult.deleteMany({ where: { studentId: id } }),
    db.student.delete({ where: { id } }), db.user.delete({ where: { id: s.userId } }),
  ]);
  await audit(me.email, "delete_student", "Student", id);
  revalidatePath("/hoc-sinh");
});

export const resetParentPassword = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES, "HOMEROOM_TEACHER");
  const phone = str(fd, "phone").replace(/\D/g, "");
  if (!phone) throw new Error("Không có số điện thoại phụ huynh");
  const defaultHash = await bcrypt.hash("123456", 10);
  const p = db as unknown as { parentAccount?: { upsert: (q: unknown) => Promise<unknown> } };
  if (p.parentAccount?.upsert) {
    await p.parentAccount.upsert({
      where: { phone },
      update: { passwordHash: defaultHash },
      create: { phone, passwordHash: defaultHash, fullName: opt(fd, "fullName") ?? "Phụ huynh" },
    });
  } else {
    const existing = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "ParentAccount" WHERE phone = ${phone} LIMIT 1`;
    const now = new Date();
    if (existing && existing.length > 0) {
      await db.$executeRaw`UPDATE "ParentAccount" SET "passwordHash" = ${defaultHash}, "updatedAt" = ${now} WHERE phone = ${phone}`;
    } else {
      const id = "pa_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      const fullName = opt(fd, "fullName") ?? "Phụ huynh";
      await db.$executeRaw`INSERT INTO "ParentAccount" ("id", "phone", "fullName", "passwordHash", "createdAt", "updatedAt") VALUES (${id}, ${phone}, ${fullName}, ${defaultHash}, ${now}, ${now})`;
    }
  }
  await audit(me.email, "reset_parent_password", "ParentAccount", phone);
  return `Mật khẩu Sổ liên lạc của phụ huynh (SĐT: ${phone}) đã được đặt lại về mặc định: 123456`;
});
