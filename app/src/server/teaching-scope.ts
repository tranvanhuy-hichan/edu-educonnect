import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { assignmentWhere, isManager } from "@/server/learning-scope";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES, type Me } from "@/lib/guard";

/** Giảng dạy: môn → khối → lớp → bài học của lớp. Quản lý thấy tất cả môn; giáo viên chỉ thấy môn/khối/lớp mình được phân công. */
export const teachingScope = (me: Me) => assignmentWhere(me);

export async function loadSubject(me: Me, subjectId: string) {
  const subject = await db.subject.findUnique({ where: { id: subjectId } });
  if (!subject) notFound();
  // giáo viên chỉ vào được môn mình được phân công
  if (!isManager(me) && !(await db.classSubjectAssignment.count({ where: { AND: [teachingScope(me), { subjectId }] } }))) notFound();
  return subject;
}

export async function loadGrade(gradeId: string) {
  const grade = await db.gradeLevel.findUnique({ where: { id: gradeId } });
  if (!grade) notFound();
  return grade;
}

export const teachingHref = (...parts: (string | undefined)[]) => "/giang-day" + parts.filter(Boolean).map((p) => `/${p}`).join("");

/** Trang Giảng dạy dành cho quản lý; giáo viên dùng "Lớp của tôi" (cùng dữ liệu, gọn hơn). */
export async function requireTeachingViewer() {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  if (!isManager(me)) redirect("/lop-cua-toi");
  return me;
}
