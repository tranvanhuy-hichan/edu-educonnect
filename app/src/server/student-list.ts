import { studentListSql, type StudentListQuery } from "./student-list-query";
import { db } from "@/lib/db";
import { currentTerm, currentYear } from "@/lib/catalog";
import { getPolicy } from "@/lib/policy";
import type { StudentStatus } from "@/server/students";

export async function loadStudentList(input: StudentListQuery) {
  const [year, term, policy] = await Promise.all([currentYear(), currentTerm(), getPolicy()]);
  const sql = studentListSql(input, { yearId: year?.id ?? "-", termId: term?.id ?? "-", attentionBelow: policy.promotion.attentionBelow });
  const [totals, page] = await Promise.all([
    db.$queryRaw<{ status: StudentStatus; count: number }[]>(sql.counts),
    db.$queryRaw<{ id: string; fullName: string; code: string | null; guardianName: string | null; guardianPhone: string | null; email: string; isActive: boolean; className: string | null; gpa: number | null; status: StudentStatus }[]>(sql.page),
  ]);
  const counts: Record<string, number> = { all: 0 };
  for (const row of totals) { counts[row.status] = row.count; counts.all += row.count; }
  const rows = page.map((s) => ({
    id: s.id, fullName: s.fullName, code: s.code, guardianName: s.guardianName, guardianPhone: s.guardianPhone,
    user: { email: s.email, isActive: s.isActive },
    current: s.className == null ? null : { schoolClass: { className: s.className } },
    status: s.status, gpa: s.gpa == null ? null : Math.round(s.gpa * 100) / 100,
  }));
  return { rows, counts, total: counts[input.tab ?? "all"] ?? 0 };
}
