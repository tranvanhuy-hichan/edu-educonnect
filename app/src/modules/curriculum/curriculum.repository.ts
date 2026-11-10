import type { Prisma } from "@prisma/client";
import { databaseFor, type DatabaseContext } from "@/infrastructure/database/unit-of-work";
export function curriculumRepository(context?: DatabaseContext) {
  const db = databaseFor(context);
  return {
    countSubjects: (ids: string[]) => db.subject.count({ where: { id: { in: ids } } }),
    lockClass: (id: string) => db.$queryRaw`SELECT "id" FROM "SchoolClass" WHERE "id" = ${id} FOR UPDATE`,
    schoolClass: (id: string) => db.schoolClass.findUniqueOrThrow({ where: { id } }),
    term: (id: string) => db.academicTerm.findUniqueOrThrow({ where: { id } }),
    membership: (schoolClassId: string, subjectId: string) => db.classSubject.findUnique({ where: { schoolClassId_subjectId: { schoolClassId, subjectId } } }),
    removedSubjects: (schoolClassId: string, keep: string[]) => db.classSubject.findMany({ where: { schoolClassId, subjectId: { notIn: keep } }, include: { subject: true, _count: { select: { assignments: true } } } }),
    examReferences: (className: string, academicYearId: string, subjectIds: string[]) => db.examSeat.count({ where: { className, paper: { subjectId: { in: subjectIds }, event: { academicTerm: { academicYearId } } } } }),
    removeSubjects: (schoolClassId: string, keep: string[]) => db.classSubject.deleteMany({ where: { schoolClassId, subjectId: { notIn: keep } } }),
    addSubjects: (schoolClassId: string, ids: string[]) => db.classSubject.createMany({ data: ids.map((subjectId) => ({ schoolClassId, subjectId })), skipDuplicates: true }),
    createClass: (data: Prisma.SchoolClassUncheckedCreateInput) => db.schoolClass.create({ data }),
  };
}
