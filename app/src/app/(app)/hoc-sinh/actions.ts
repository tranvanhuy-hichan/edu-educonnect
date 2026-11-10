"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { MANAGER_ROLES, assertRole } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { parseDate } from "@/lib/format";
import { audit } from "@/lib/audit";
import { CLASS_CAPACITY } from "@/lib/catalog";
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
  return { fullName, dob, email, guardianName: opt(fd, "guardianName"), guardianPhone: gp };
}

export const createStudent = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const c = await createStudentWithAccount(readStudent(fd));
  const classId = str(fd, "classId");
  let extra = "";
  if (classId) {
    const cls = await db.schoolClass.findUnique({ where: { id: classId } });
    const s = await db.student.findUniqueOrThrow({ where: { code: c.code } });
    if (cls && (await db.studentClassEnrollment.count({ where: { schoolClassId: classId } })) < CLASS_CAPACITY) {
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
  await db.student.update({ where: { id }, data: { fullName: d.fullName, dob: d.dob, guardianName: d.guardianName, guardianPhone: d.guardianPhone } });
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
  if ((await db.studentClassEnrollment.count({ where: { schoolClassId: classId } })) >= CLASS_CAPACITY) throw new Error(`Lớp ${cls.className} đã đủ sĩ số`);
  await db.studentClassEnrollment.upsert({
    where: { studentId_academicYearId: { studentId, academicYearId: cls.academicYearId } },
    update: { schoolClassId: classId }, create: { studentId, schoolClassId: classId, academicYearId: cls.academicYearId },
  });
  await audit(me.email, "set_student_class", "Student", studentId);
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
