import type { Prisma } from "@prisma/client";
/** Explicit migration only, never automatic on creating a separate BCH account. */
export async function adoptUnionTeacher(tx: Prisma.TransactionClient, accountId: string) {
  await tx.$queryRaw`SELECT id FROM public."User" WHERE id=${accountId} FOR UPDATE`;
  const a = await tx.doanUser.findUniqueOrThrow({ where: { id: accountId }, include: { member: true, eduUser: { include: { teacher: true, student: true } } } });
  if (a.superAdmin || a.role !== "ADMIN") throw new Error("Chỉ chuyển hồ sơ BCH thường thành giáo viên");
  if (a.member || a.eduUser?.student || a.eduUser?.roles.includes("STUDENT")) throw new Error("Tài khoản học sinh/đoàn viên không được chuyển thành giáo viên");
  const matchingPupil = await tx.student.findFirst({ where: { fullName: { equals: a.fullName.trim(), mode: "insensitive" } }, select: { id: true } });
  if (matchingPupil) throw new Error("Có học sinh trùng họ tên: cần giữ tài khoản BCH riêng và xác minh thủ công");
  if (a.eduUser?.teacher) return { id: a.eduUser.id, created: false };
  // The old guard requires the teacher profile to exist before ADMIN can be linked.
  // This temporary role change stays inside one transaction; credentials/status are untouched.
  await tx.doanUser.update({ where: { id: a.id }, data: { role: "EXTERNAL" } });
  const u = a.eduUser ?? await tx.user.create({ data: { accountId: a.id, email: `${a.id}@bch.local`, roles: ["SUBJECT_TEACHER"], isActive: a.status === "ACTIVE" } });
  await tx.teacher.create({ data: { userId: u.id, fullName: a.fullName, code: `BCH-${a.id}`, note: "Bổ sung hồ sơ từ tài khoản BCH Đoàn trường hiện có" } });
  if (!u.roles.includes("SUBJECT_TEACHER")) await tx.user.update({ where: { id: u.id }, data: { roles: { push: "SUBJECT_TEACHER" } } });
  await tx.doanUser.update({ where: { id: a.id }, data: { role: "ADMIN" } });
  await tx.activityLog.create({ data: { actorEmail: "migration:adopt-union-teachers", action: "union_teacher.adopt", targetType: "User", targetId: u.id, afterData: { accountId: a.id, isActive: u.isActive } } });
  return { id: u.id, created: true };
}
