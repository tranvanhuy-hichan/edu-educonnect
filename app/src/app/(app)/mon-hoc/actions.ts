"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ADMIN_ROLES, MANAGER_ROLES, assertRole } from "@/lib/guard";
import { wrap, str, int } from "@/lib/action";
import { audit } from "@/lib/audit";

function read(fd: FormData) {
  const subjectName = str(fd, "name");
  if (!subjectName) throw new Error("Nhập tên môn học");
  const defaultPeriodsPerWeek = int(fd, "periods", 2);
  if (defaultPeriodsPerWeek < 1 || defaultPeriodsPerWeek > 20) throw new Error("Số tiết mỗi tuần phải từ 1 đến 20");
  return { subjectName, defaultPeriodsPerWeek };
}

export const createSubject = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const d = read(fd);
  if (await db.subject.findUnique({ where: { subjectName: d.subjectName } })) throw new Error("Tên môn học đã tồn tại");
  const s = await db.subject.create({ data: d });
  await audit(me.email, "create_subject", "Subject", s.id);
  revalidatePath("/mon-hoc");
  redirect(`/mon-hoc/${s.id}`);
});

export const updateSubject = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const id = str(fd, "id");
  const d = read(fd);
  if (await db.subject.findFirst({ where: { subjectName: d.subjectName, id: { not: id } } })) throw new Error("Tên môn học đã tồn tại");
  await db.subject.update({ where: { id }, data: d });
  await audit(me.email, "update_subject", "Subject", id);
  revalidatePath("/mon-hoc"); revalidatePath(`/mon-hoc/${id}`);
});

export const deleteSubject = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  if (await db.classSubject.count({ where: { subjectId: id } })) throw new Error("Môn đang thuộc danh sách môn học của lớp, không thể xóa");
  if (await db.classSubjectAssignment.count({ where: { subjectId: id } })) throw new Error("Môn học đã được phân công cho lớp, hãy xoá các phân công trước");
  if (await db.examPaper.count({ where: { subjectId: id } })) throw new Error("Môn đã có lịch thi, không thể xóa");
  await db.subject.delete({ where: { id } });
  await audit(me.email, "delete_subject", "Subject", id);
  revalidatePath("/mon-hoc");
  redirect("/mon-hoc");
});
