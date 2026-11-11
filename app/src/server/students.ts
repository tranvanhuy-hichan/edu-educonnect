import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { genPassword, genStudentCode } from "@/lib/password";
import { currentTerm, currentYear } from "@/lib/catalog";
import { getPolicy } from "@/lib/policy";

export type NewStudent = { fullName: string; dob: Date | null; guardianName?: string | null; guardianPhone?: string | null; email?: string | null };
export type Created = { code: string; password: string; fullName: string; email: string };

/** Tạo học sinh + tài khoản: mã HS làm tên đăng nhập, mật khẩu ngẫu nhiên (hiện MỘT lần), bắt đổi mật khẩu lần đầu. */
export async function createStudentWithAccount(d: NewStudent): Promise<Created> {
  const password = genPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  for (let i = 0; i < 8; i++) {
    const code = genStudentCode();
    const email = (d.email || `${code.toLowerCase()}@sonha.edu.vn`).toLowerCase();
    if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
      if (d.email) throw new Error(`Email "${email}" đã có tài khoản`);
      continue;
    }
    try {
      await db.student.create({
        data: {
          code, fullName: d.fullName, dob: d.dob, guardianName: d.guardianName ?? null, guardianPhone: d.guardianPhone ?? null,
          user: { create: { email, passwordHash, roles: ["STUDENT"], mustChangePwd: true } },
        },
      });
      return { code, password, fullName: d.fullName, email };
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  throw new Error("Không tạo được mã học sinh");
}

export type ImportRow = { fullName: string; username: string; password: string; guardian: string; status: string };

/** "Họ tên, Ngày sinh (dd/mm/yyyy), Tên phụ huynh, SĐT phụ huynh" — tách bằng tab, | hoặc dấu phẩy. */
export function parseStudentLines(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\t|\||,|;/).map((x) => x.trim())).filter((c) => c[0]).map((c, i) => {
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(c[1] ?? "");
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c[1] ?? "");
    const dob = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : iso ? new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])) : null;
    if (c[0].length < 2) throw new Error(`Dòng ${i + 1}: họ tên phải có ít nhất 2 ký tự`);
    if (c[1] && (!dob || Number.isNaN(dob.getTime()) || (m ? dob.getUTCDate() !== +m[1] || dob.getUTCMonth() !== +m[2] - 1 : iso ? dob.getUTCDate() !== +iso[3] || dob.getUTCMonth() !== +iso[2] - 1 : true))) throw new Error(`Dòng ${i + 1} (${c[0]}): thiếu hoặc sai ngày sinh (dd/mm/yyyy)`);
    return { fullName: c[0], dob, guardianName: c[2] || null, guardianPhone: c[3] || null };
  });
}

/** Tạo học sinh + tài khoản rồi xếp vào lớp. Lớp đã đủ sĩ số thì vẫn tạo tài khoản nhưng chưa xếp lớp. */
export async function importStudentsToClass(schoolClassId: string, text: string): Promise<ImportRow[]> {
  const cls = await db.schoolClass.findUniqueOrThrow({ where: { id: schoolClassId } });
  const lines = parseStudentLines(text);
  if (!lines.length) throw new Error("Chưa có học sinh nào trong danh sách");
  if (lines.length > 200) throw new Error("Mỗi lần nhập tối đa 200 học sinh");
  let active = await db.studentClassEnrollment.count({ where: { schoolClassId } });
  const out: ImportRow[] = [];
  for (const l of lines) {
    let c: Created;
    try {
      c = await createStudentWithAccount(l);
    } catch (error) {
      out.push({ fullName: l.fullName, username: "", password: "", guardian: "", status: error instanceof Error ? error.message : "Không tạo được tài khoản" });
      continue;
    }
    let status = "Đã xếp lớp";
    try {
      const student = await db.student.findUniqueOrThrow({ where: { code: c.code } });
      if (active >= (await getPolicy()).promotion.classCapacity) status = "Lớp đã đủ sĩ số — chưa xếp lớp";
      else {
        await db.studentClassEnrollment.create({ data: { studentId: student.id, schoolClassId, academicYearId: cls.academicYearId } });
        active++;
      }
    } catch {
      status = "Đã tạo tài khoản — chưa xếp được lớp, hãy xếp lớp lại";
    }
    out.push({ fullName: l.fullName, username: c.email, password: c.password, guardian: [l.guardianName, l.guardianPhone].filter(Boolean).join(" · "), status });
  }
  return out;
}

export type StudentStatus = "learning" | "waiting" | "attention" | "locked";
export const STATUS_LABEL: Record<StudentStatus, string> = { learning: "Đang học", waiting: "Chờ xếp lớp", attention: "Cần quan tâm", locked: "Đã khóa" };
export const STATUS_COLOR: Record<StudentStatus, string> = { learning: "text-green-700", waiting: "text-sky-700", attention: "text-red-600", locked: "text-slate-500" };

export type StudentRow = Awaited<ReturnType<typeof loadStudents>>[number];

/** Học sinh kèm trạng thái suy ra: có lớp ở năm học hiện tại → Đang học (điểm TB < 5 → Cần quan tâm); chưa có → Chờ xếp lớp; tài khoản bị khóa → Đã khóa. */
export async function loadStudents(where: object = {}) {
  const [year, term, policy] = await Promise.all([currentYear(), currentTerm(), getPolicy()]);
  const attentionBelow = policy.promotion.attentionBelow;
  const list = await db.student.findMany({
    where, orderBy: { fullName: "asc" },
    include: { user: { select: { email: true, isActive: true, createdAt: true, mustChangePwd: true } }, enrollments: { include: { schoolClass: { include: { gradeLevel: true, homeroomTeacher: true } }, academicYear: true } } },
  });
  const avgs = term ? await db.subjectTermAverage.groupBy({ by: ["studentId"], where: { academicTermId: term.id, studentId: { in: list.map((s) => s.id) } }, _avg: { averageValue: true } }) : [];
  const avg = new Map(avgs.map((a) => [a.studentId, a._avg.averageValue]));
  return list.map((s) => {
    const current = s.enrollments.find((e) => e.academicYearId === year?.id) ?? null;
    const gpa = avg.get(s.id) ?? null;
    const status: StudentStatus = !s.user.isActive ? "locked" : !current ? "waiting" : gpa != null && gpa < attentionBelow ? "attention" : "learning";
    return { ...s, current, gpa: gpa == null ? null : Math.round(gpa * 100) / 100, status };
  });
}
