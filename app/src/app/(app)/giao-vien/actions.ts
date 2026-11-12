"use server";
import { createSharedAccount, setSharedPassword, credentialOfUser } from "@/modules/account/account.repository";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ADMIN_ROLES, MANAGER_ROLES, assertRole } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { genPassword, genTeacherCode } from "@/lib/password";
import { parseAccountNames, resetPassword } from "@/server/accounts";
import type { Role } from "@prisma/client";

const TEACH: Role[] = ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"];
const rolesOf = (fd: FormData): Role[] => {
  const r = TEACH.filter((x) => fd.getAll("roles").includes(x));
  return r.length ? r : ["SUBJECT_TEACHER"];
};
const validEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e);

/** Hồ sơ cá nhân + các môn phụ trách, đọc từ form. */
function readProfile(fd: FormData) {
  const gender = opt(fd, "gender");
  if (gender && !["MALE", "FEMALE", "OTHER"].includes(gender)) throw new Error("Giới tính không hợp lệ");
  const date = (k: string, label: string) => { const v = opt(fd, k); if (!v) return null; const d = new Date(v); if (Number.isNaN(d.getTime())) throw new Error(`${label} không hợp lệ`); return d; };
  const contactEmail = opt(fd, "contactEmail");
  if (contactEmail && !validEmail(contactEmail)) throw new Error("Email liên hệ không hợp lệ");
  const phone = opt(fd, "phone")?.replace(/\s/g, "") ?? null;
  if (phone && !/^[0-9+]{8,15}$/.test(phone)) throw new Error("Số điện thoại không hợp lệ");
  return { phone, gender, dob: date("dob", "Ngày sinh"), contactEmail, address: opt(fd, "address"), idNumber: opt(fd, "idNumber"), degree: opt(fd, "degree"), startDate: date("startDate", "Ngày bắt đầu công tác"), note: opt(fd, "note") };
}
async function readSubjects(fd: FormData, roles: Role[]) {
  const ids = [...new Set(fd.getAll("subjectIds").map(String).filter(Boolean))];
  if (roles.includes("SUBJECT_TEACHER") && !ids.length) throw new Error("Chọn ít nhất một môn giáo viên phụ trách");
  if (ids.length && (await db.subject.count({ where: { id: { in: ids } } })) !== ids.length) throw new Error("Môn học không tồn tại");
  return ids;
}

export const createTeacher = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const fullName = str(fd, "fullName");
  const email = str(fd, "email").toLowerCase();
  if (fullName.length < 2) throw new Error("Nhập họ tên giáo viên");
  if (!validEmail(email)) throw new Error("Email đăng nhập không hợp lệ");
  if (await db.user.findUnique({ where: { email } })) throw new Error("Email này đã có tài khoản");
  const password = genPassword();
  let code = genTeacherCode();
  while (await db.teacher.findUnique({ where: { code } })) code = genTeacherCode();
  const roles = rolesOf(fd), profile = readProfile(fd), subjectIds = await readSubjects(fd, roles);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.$transaction(async (tx) => {
    const account = await createSharedAccount(tx, { username: code, passwordHash, fullName });
    return tx.user.create({ data: { accountId: account.id, email, roles, teacher: { create: { fullName, code, ...profile, subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) } } } }, include: { teacher: true } });
  });
  await audit(me.email, "create_teacher", "Teacher", user.teacher!.id);
  revalidatePath("/giao-vien");
  return { ok: "Đã tạo giáo viên. File mật khẩu ban đầu đang tự tải về.", data: { credentials: JSON.stringify([{ fullName, username: email, password }]) } };
});

export const updateTeacher = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const id = str(fd, "id");
  const fullName = str(fd, "fullName");
  if (fullName.length < 2) throw new Error("Nhập họ tên giáo viên");
  const t = await db.teacher.findUniqueOrThrow({ where: { id }, include: { user: true } });
  // chỉ đổi 2 vai trò giáo viên; giữ nguyên các vai trò khác (Hiệu trưởng, Thủ thư...)
  const keep = t.user.roles.filter((r) => !TEACH.includes(r));
  const roles = rolesOf(fd), profile = readProfile(fd), subjectIds = await readSubjects(fd, roles);
  const next = [...keep, ...roles];
  // Không cho bỏ môn đang có phân công giảng dạy (bài học, điểm, thời khóa biểu gắn với phân công đó)
  const inUse = await db.classSubjectAssignment.findMany({ where: { teacherId: id, subjectId: { notIn: subjectIds } }, include: { subject: true }, distinct: ["subjectId"] });
  if (inUse.length) throw new Error(`Không bỏ được môn ${inUse.map((a) => a.subject.subjectName).join(", ")} vì giáo viên đang được phân công dạy môn này`);
  await db.$transaction([
    db.teacher.update({ where: { id }, data: { fullName, ...profile } }),
    db.teacherSubject.deleteMany({ where: { teacherId: id } }),
    db.teacherSubject.createMany({ data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })) }),
    db.user.update({ where: { id: t.userId }, data: { roles: next } }),
  ]);
  await audit(me.email, "update_teacher", "Teacher", id);
  revalidatePath(`/giao-vien/${id}`); revalidatePath("/giao-vien");
});

export const toggleTeacherLocked = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const t = await db.teacher.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { user: true } });
  if (t.user.id === me.id) throw new Error("Không thể khóa chính mình");
  await db.user.update({ where: { id: t.userId }, data: { isActive: !t.user.isActive } });
  await audit(me.email, t.user.isActive ? "lock_teacher" : "unlock_teacher", "Teacher", t.id);
  revalidatePath(`/giao-vien/${t.id}`); revalidatePath("/giao-vien");
});

export const resetTeacherPassword = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const t = await db.teacher.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { user: true } });
  const pw = await resetPassword(t.userId);
  await audit(me.email, "reset_password", "Teacher", t.id);
  return `Tài khoản ${t.user.email} · mật khẩu mới: ${pw}`;
});

export const deleteTeacher = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  const [a, h] = await Promise.all([db.classSubjectAssignment.count({ where: { teacherId: id } }), db.schoolClass.count({ where: { homeroomTeacherId: id } })]);
  if (await db.examInvigilation.count({ where: { teacherId: id } })) throw new Error("Giáo viên có lịch sử coi thi, hãy khóa tài khoản thay vì xóa hồ sơ");
  if (a || h) throw new Error("Giáo viên còn phân công giảng dạy/chủ nhiệm, hãy gỡ trước hoặc dùng 'Khóa tài khoản'");
  const t = await db.teacher.findUniqueOrThrow({ where: { id } });
  if (t.userId === me.id) throw new Error("Không thể xoá chính mình");
  await db.$transaction([db.teacher.delete({ where: { id } }), db.user.delete({ where: { id: t.userId } })]);
  await audit(me.email, "delete_teacher", "Teacher", id);
  revalidatePath("/giao-vien");
  redirect("/giao-vien");
});

export const importTeachers = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const names = parseAccountNames(str(fd, "list"));
  const rows = [];
  for (const fullName of names) {
    const password = genPassword();
    try {
      let created = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = genTeacherCode();
        const email = `${code.toLowerCase()}@sonha.edu.vn`;
        try {
          const passwordHash = await bcrypt.hash(password, 10);
          await db.$transaction(async (tx) => {
            const account = await createSharedAccount(tx, { username: code, passwordHash, fullName });
            await tx.user.create({ data: { accountId: account.id, email, roles: rolesOf(fd), teacher: { create: { fullName, code } } } });
          });
          rows.push({ fullName, username: email, password, status: "Đã tạo" });
          created = true;
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "P2002") throw error;
        }
      }
      if (!created) throw new Error("Không tạo được mã giáo viên, hãy nhập lại dòng này");
    } catch (error) {
      rows.push({ fullName, username: "", password: "", status: error instanceof Error ? error.message : "Không tạo được tài khoản" });
    }
  }
  await audit(me.email, "import_teachers", "Teacher", String(rows.filter((r) => r.username).length));
  revalidatePath("/giao-vien"); revalidatePath("/tai-khoan");
  return { ok: `Đã tạo ${rows.filter((r) => r.username).length}/${names.length} giáo viên. File mật khẩu và kết quả từng dòng đang tự tải về.`, data: { credentials: JSON.stringify(rows) } };
});
