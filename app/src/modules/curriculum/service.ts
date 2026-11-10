import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
type Client = Prisma.TransactionClient;

export async function validateSubjectIds(client: Client, ids: string[]) {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) throw new Error("Chọn ít nhất một môn học cho lớp");
  if (unique.length > 100 || await client.subject.count({ where: { id: { in: unique } } }) !== unique.length) throw new Error("Danh sách môn học không hợp lệ");
  return unique;
}

export async function setClassSubjects(client: Client, schoolClassId: string, subjectIds: string[]) {
  await client.$queryRaw`SELECT "id" FROM "SchoolClass" WHERE "id" = ${schoolClassId} FOR UPDATE`;
  const ids = await validateSubjectIds(client, subjectIds);
  const cls = await client.schoolClass.findUniqueOrThrow({ where: { id: schoolClassId } });
  const removed = await client.classSubject.findMany({ where: { schoolClassId, subjectId: { notIn: ids } }, include: { subject: true, _count: { select: { assignments: true } } } });
  const assigned = removed.filter((row) => row._count.assignments > 0);
  if (assigned.length) throw new Error(`Không thể bỏ môn đã có phân công/dữ liệu học tập: ${assigned.map((row) => row.subject.subjectName).join(", ")}. Gỡ phân công khi chưa có dữ liệu trước.`);
  if (removed.length && await client.examSeat.count({ where: { className: cls.className, paper: { subjectId: { in: removed.map((row) => row.subjectId) }, event: { academicTerm: { academicYearId: cls.academicYearId } } } } })) throw new Error("Không thể bỏ môn đã có học sinh của lớp trong lịch thi. Giữ môn để bảo toàn danh sách thi.");
  await client.classSubject.deleteMany({ where: { schoolClassId, subjectId: { notIn: ids } } });
  await client.classSubject.createMany({ data: ids.map((subjectId) => ({ schoolClassId, subjectId })), skipDuplicates: true });
}

export async function requireClassSubject(client: Client, schoolClassId: string, subjectId: string, academicTermId: string) {
  const [cls, term, membership] = await Promise.all([
    client.schoolClass.findUniqueOrThrow({ where: { id: schoolClassId } }),
    client.academicTerm.findUniqueOrThrow({ where: { id: academicTermId } }),
    client.classSubject.findUnique({ where: { schoolClassId_subjectId: { schoolClassId, subjectId } } }),
  ]);
  if (cls.academicYearId !== term.academicYearId) throw new Error("Học kỳ không thuộc năm học của lớp");
  if (!membership) throw new Error("Lớp không học môn này. Chọn môn trong danh sách môn học của lớp.");
}

export async function createClassWithSubjects(data: Prisma.SchoolClassUncheckedCreateInput, subjectIds: string[], transaction?: Client) {
  const work = async (client: Client) => {
    const ids = await validateSubjectIds(client, subjectIds);
    const cls = await client.schoolClass.create({ data });
    await client.classSubject.createMany({ data: ids.map((subjectId) => ({ schoolClassId: cls.id, subjectId })) });
    return cls;
  };
  return transaction ? work(transaction) : prisma.$transaction(work);
}
