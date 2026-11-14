import { Prisma } from "@prisma/client";

export type StudentListQuery = { q?: string; tab?: string; sort?: string; grade?: string; classId?: string; skip: number; take: number };

/** Filtering, derived status, counts and pagination stay in PostgreSQL. No full-school roster crosses the connection. */
export function studentListSql(input: StudentListQuery, context: { yearId: string; termId: string; attentionBelow: number }) {
  const keyword = input.q?.toLowerCase() ?? "";
  const base = Prisma.sql`
    WITH base AS (
      SELECT s.id, s."fullName", s.code, s."guardianName", s."guardianPhone", u.email, u."isActive", u."createdAt", c."className", g.gpa,
        CASE WHEN NOT u."isActive" THEN 'locked'
          WHEN e.id IS NULL THEN 'waiting'
          WHEN g.gpa < ${context.attentionBelow} THEN 'attention'
          ELSE 'learning' END AS status
      FROM edu."Student" s
      JOIN edu."User" u ON u.id = s."userId"
      LEFT JOIN edu."StudentClassEnrollment" e ON e."studentId" = s.id AND e."academicYearId" = ${context.yearId}
      LEFT JOIN edu."SchoolClass" c ON c.id = e."schoolClassId"
      LEFT JOIN (
        SELECT "studentId", AVG("averageValue") AS gpa
        FROM edu."SubjectTermAverage" WHERE "academicTermId" = ${context.termId} GROUP BY "studentId"
      ) g ON g."studentId" = s.id
      WHERE (${keyword} = '' OR strpos(lower(s."fullName" || ' ' || coalesce(s.code, '') || ' ' || u.email), ${keyword}) > 0)
        AND (${input.classId ?? ""} = '' OR e."schoolClassId" = ${input.classId ?? ""})
        AND (${input.grade ?? ""} = '' OR c."gradeLevelId" = ${input.grade ?? ""})
    )`;
  const order = input.sort === "new" ? Prisma.sql`"createdAt" DESC, "fullName" ASC, id ASC`
    : input.sort === "za" ? Prisma.sql`"fullName" DESC, id DESC` : Prisma.sql`"fullName" ASC, id ASC`;
  return {
    counts: Prisma.sql`${base} SELECT status, count(*)::int AS count FROM base GROUP BY status`,
    page: Prisma.sql`${base} SELECT id, "fullName", code, "guardianName", "guardianPhone", email, "isActive", "className", gpa, status FROM base WHERE (${input.tab ?? "all"} = 'all' OR status = ${input.tab ?? "all"}) ORDER BY ${order} LIMIT ${input.take} OFFSET ${input.skip}`,
  };
}
