"use server";
import { createClassWithSubjects, setClassSubjects } from "@/modules/curriculum/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ADMIN_ROLES, MANAGER_ROLES, assertRole } from "@/lib/guard";
import { wrap, str, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import { CLASS_CAPACITY } from "@/lib/catalog";
import { ensureTeacherRole } from "@/server/accounts";
import { importStudentsToClass } from "@/server/students";
import { createStudentClassEnrollment } from "@/modules/academic/academic.service";

async function readClass(fd: FormData, exceptId?: string) {
  const className = str(fd, "name");
  const gradeLevelId = str(fd, "gradeLevelId");
  const academicYearId = str(fd, "academicYearId");
  const roomId = str(fd, "roomId");
  const shiftRaw = str(fd, "shift") || "MORNING";
  const shift = shiftRaw === "AFTERNOON" ? ("AFTERNOON" as const) : ("MORNING" as const);
  if (!roomId || !await db.room.findUnique({ where: { id: roomId } })) throw new Error("Chọn phòng học cố định cho lớp");
  if (!className) throw new Error("Nhập tên lớp");
  if (!gradeLevelId) throw new Error("Chọn khối");
  if (!academicYearId) throw new Error("Chọn năm học");
  if (await db.schoolClass.findFirst({ where: { className, academicYearId, ...(exceptId ? { id: { not: exceptId } } : {}) } })) throw new Error(`Lớp ${className} đã có trong năm học này`);

  // Kiểm tra xung đột phòng học: Trong cùng một năm học và ca học (sáng hoặc chiều), một phòng chỉ có tối đa 1 lớp học
  const roomConflict = await db.schoolClass.findFirst({
    where: {
      academicYearId,
      roomId,
      shift,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    include: { room: true },
  });
  if (roomConflict) {
    const shiftText = shift === "MORNING" ? "buổi sáng (tiết 1–5)" : "buổi chiều (tiết 6–10)";
    throw new Error(`Phòng ${roomConflict.room?.roomName || ""} đã được xếp cho lớp ${roomConflict.className} học vào ${shiftText} trong năm học này. Trong cùng một buổi, không thể có 2 lớp học chung 1 phòng. Vui lòng chọn phòng khác hoặc đổi ca học.`);
  }

  return { className, gradeLevelId, academicYearId, roomId, shift, homeroomTeacherId: opt(fd, "homeroomTeacherId") };
}

export const createClass = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const d = await readClass(fd);
  const c = await createClassWithSubjects(d, fd.getAll("subjectIds").map(String));
  if (d.homeroomTeacherId) await ensureTeacherRole(d.homeroomTeacherId, "HOMEROOM_TEACHER");
  await audit(me.email, "create_class", "SchoolClass", c.id);
  revalidatePath("/lop-hoc");
  redirect(`/lop-hoc/${c.id}`);
});

export const updateClass = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const id = str(fd, "id");
  const d = await readClass(fd, id);
  await db.$transaction(async (tx) => {
    const original = await tx.schoolClass.findUniqueOrThrow({ where: { id } });
    if (original.academicYearId !== d.academicYearId && (await tx.studentClassEnrollment.count({ where: { schoolClassId: id } }) || await tx.classSubjectAssignment.count({ where: { schoolClassId: id } }))) throw new Error("Lớp đã có học sinh/phân công, không thể đổi năm học");
    if (original.shift !== d.shift) {
      const hasLogs = await tx.classPeriodLog.count({ where: { schoolClassId: id } });
      if (hasLogs > 0) {
        throw new Error("Lớp đã có sổ đầu bài được ghi nhận theo ca học cũ. Không thể đổi ca học để tránh sai lệch dữ liệu lịch sử.");
      }
      // Chưa có sổ đầu bài: dọn dẹp các tiết TKB xung đột với ca mới để sẵn sàng tạo/xếp TKB mới
      if (d.shift === "MORNING") {
        await tx.timetableSlot.deleteMany({ where: { schoolClassId: id, periodNo: { gt: 5 } } });
      } else {
        await tx.timetableSlot.deleteMany({ where: { schoolClassId: id, periodNo: { lte: 5 } } });
      }
    }
    await setClassSubjects(tx, id, fd.getAll("subjectIds").map(String));
    await tx.schoolClass.update({ where: { id }, data: d });
  });
  if (d.homeroomTeacherId) await ensureTeacherRole(d.homeroomTeacherId, "HOMEROOM_TEACHER");
  await audit(me.email, "update_class", "SchoolClass", id);
  revalidatePath("/lop-hoc"); revalidatePath(`/lop-hoc/${id}`); revalidatePath("/lich-hoc/tu-dong"); revalidatePath("/phan-cong"); revalidatePath("/lich-thi/them");
});

export const deleteClass = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  const [a, s, l] = await Promise.all([db.classSubjectAssignment.count({ where: { schoolClassId: id } }), db.timetableSlot.count({ where: { schoolClassId: id } }), db.classPeriodLog.count({ where: { schoolClassId: id } })]);
  if (await db.timetableActivity.count({ where: { schoolClassId: id } })) throw new Error("Lớp đã có hoạt động cố định trong thời khóa biểu, không thể xoá");
  if (a || s || l) throw new Error("Lớp đã có phân công / thời khoá biểu / sổ đầu bài, hãy chuyển học sinh sang lớp khác thay vì xoá");
  await db.classEmulationScore.deleteMany({ where: { schoolClassId: id } });
  await db.studentClassEnrollment.deleteMany({ where: { schoolClassId: id } });
  await db.schoolClass.delete({ where: { id } });
  await audit(me.email, "delete_class", "SchoolClass", id);
  revalidatePath("/lop-hoc");
  redirect("/lop-hoc");
});

export const enrollStudent = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const schoolClassId = str(fd, "classId");
  const studentId = str(fd, "studentId");
  if (!studentId) throw new Error("Chọn học sinh");
  const cls = await db.schoolClass.findUniqueOrThrow({ where: { id: schoolClassId } });
  if ((await db.studentClassEnrollment.count({ where: { schoolClassId } })) >= CLASS_CAPACITY) throw new Error(`Lớp đã đủ sĩ số (${CLASS_CAPACITY})`);
  await createStudentClassEnrollment(me, { studentId, schoolClassId, academicYearId: cls.academicYearId });
  await audit(me.email, "enroll_student", "StudentClassEnrollment", studentId);
  revalidatePath(`/lop-hoc/${schoolClassId}`);
  return "Đã xếp học sinh vào lớp";
});

export const removeEnrollment = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const e = await db.studentClassEnrollment.delete({ where: { id: str(fd, "id") } });
  await db.schoolClass.updateMany({ where: { id: e.schoolClassId, monitorStudentId: e.studentId }, data: { monitorStudentId: null } });
  await audit(me.email, "remove_enrollment", "StudentClassEnrollment", e.studentId);
  revalidatePath(`/lop-hoc/${e.schoolClassId}`); revalidatePath(`/hoc-sinh/${e.studentId}`);
});

export const transferStudent = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const e = await db.studentClassEnrollment.findUniqueOrThrow({ where: { id: str(fd, "id") } });
  const toClassId = str(fd, "toClassId");
  if (!toClassId || toClassId === e.schoolClassId) throw new Error("Chọn lớp khác");
  const target = await db.schoolClass.findUniqueOrThrow({ where: { id: toClassId } });
  if (target.academicYearId !== e.academicYearId) throw new Error("Chỉ chuyển được sang lớp cùng năm học");
  if ((await db.studentClassEnrollment.count({ where: { schoolClassId: toClassId } })) >= CLASS_CAPACITY) throw new Error(`Lớp ${target.className} đã đủ sĩ số`);
  await db.studentClassEnrollment.update({ where: { id: e.id }, data: { schoolClassId: toClassId } });
  await db.schoolClass.updateMany({ where: { id: e.schoolClassId, monitorStudentId: e.studentId }, data: { monitorStudentId: null } });
  await audit(me.email, "transfer_student", "StudentClassEnrollment", e.studentId);
  revalidatePath(`/lop-hoc/${e.schoolClassId}`); revalidatePath(`/lop-hoc/${toClassId}`); revalidatePath(`/hoc-sinh/${e.studentId}`);
  return `Đã chuyển sang lớp ${target.className}`;
});

/** Dán danh sách học sinh → tạo tài khoản, xếp lớp; trả JSON để trình duyệt tự tải file CSV mật khẩu. */
export const importStudents = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const classId = str(fd, "classId");
  const rows = await importStudentsToClass(classId, String(fd.get("list") ?? ""));
  await audit(me.email, "import_students", "SchoolClass", classId);
  revalidatePath(`/lop-hoc/${classId}`); revalidatePath("/hoc-sinh");
  const enrolled = rows.filter((r) => r.status === "Đã xếp lớp").length;
  return { ok: `Đã tạo ${rows.filter((r) => r.username).length}/${rows.length} tài khoản, xếp lớp ${enrolled} học sinh. File mật khẩu đang tự tải về.`, data: { rows: JSON.stringify(rows), className: (await db.schoolClass.findUniqueOrThrow({ where: { id: classId } })).className } };
});

/** Chọn lớp trưởng: chỉ chọn được học sinh đang thuộc lớp (nên lớp phải có học sinh trước). Chọn lại người đang là lớp trưởng thì bỏ chọn. */
export const setMonitor = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const classId = str(fd, "classId");
  const studentId = str(fd, "studentId");
  const cls = await db.schoolClass.findUnique({ where: { id: classId }, select: { monitorStudentId: true, academicYearId: true } });
  if (!cls) throw new Error("Lớp không tồn tại");
  if (cls.monitorStudentId === studentId) {
    await db.schoolClass.update({ where: { id: classId }, data: { monitorStudentId: null } });
    await audit(me.email, "unset_class_monitor", "SchoolClass", classId);
    revalidatePath("/lop-hoc"); revalidatePath(`/lop-hoc/${classId}`);
    return "Đã bỏ chọn lớp trưởng";
  }
  const inClass = await db.studentClassEnrollment.findFirst({ where: { schoolClassId: classId, studentId }, select: { id: true } });
  if (!inClass) throw new Error("Học sinh này không thuộc lớp");
  await db.schoolClass.update({ where: { id: classId }, data: { monitorStudentId: studentId } });
  await audit(me.email, "set_class_monitor", "SchoolClass", classId);
  revalidatePath("/lop-hoc"); revalidatePath(`/lop-hoc/${classId}`);
  return "Đã chọn lớp trưởng";
});
