import type { Prisma } from "@prisma/client";
import { withTransaction, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
import { curriculumRepository } from "./curriculum.repository";
type Client = DatabaseContext | undefined;

export async function validateSubjectIds(client: Client, ids: string[]) {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) throw new Error("Chọn ít nhất một môn học cho lớp");
  if (unique.length > 100 || await curriculumRepository(client).countSubjects(unique) !== unique.length) throw new Error("Danh sách môn học không hợp lệ");
  return unique;
}

export async function setClassSubjects(client: Client, schoolClassId: string, subjectIds: string[]) {
  await curriculumRepository(client).lockClass(schoolClassId);
  const ids = await validateSubjectIds(client, subjectIds);
  const cls = await curriculumRepository(client).schoolClass(schoolClassId);
  const removed = await curriculumRepository(client).removedSubjects(schoolClassId, ids);
  const assigned = removed.filter((row) => row._count.assignments > 0);
  if (assigned.length) throw new Error(`Không thể bỏ môn đã có phân công/dữ liệu học tập: ${assigned.map((row) => row.subject.subjectName).join(", ")}. Gỡ phân công khi chưa có dữ liệu trước.`);
  if (removed.length && await curriculumRepository(client).examReferences(cls.className, cls.academicYearId, removed.map((row) => row.subjectId))) throw new Error("Không thể bỏ môn đã có học sinh của lớp trong lịch thi. Giữ môn để bảo toàn danh sách thi.");
  await curriculumRepository(client).removeSubjects(schoolClassId, ids);
  await curriculumRepository(client).addSubjects(schoolClassId, ids);
}

export async function requireClassSubject(client: Client, schoolClassId: string, subjectId: string, academicTermId: string) {
  const [cls, term, membership] = await Promise.all([
    curriculumRepository(client).schoolClass(schoolClassId),
    curriculumRepository(client).term(academicTermId),
    curriculumRepository(client).membership(schoolClassId, subjectId),
  ]);
  if (cls.academicYearId !== term.academicYearId) throw new Error("Học kỳ không thuộc năm học của lớp");
  if (!membership) throw new Error("Lớp không học môn này. Chọn môn trong danh sách môn học của lớp.");
}

export async function createClassWithSubjects(data: Prisma.SchoolClassUncheckedCreateInput, subjectIds: string[], transaction?: Client) {
  const work = async (client: Client) => {
    const ids = await validateSubjectIds(client, subjectIds);
    const cls = await curriculumRepository(client).createClass(data);
    await curriculumRepository(client).addSubjects(cls.id, ids);
    return cls;
  };
  return transaction ? work(transaction) : withTransaction(work);
}
