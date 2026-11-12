/**
 * Đo kế hoạch thực thi của các truy vấn nóng trên DB hiện tại (DATABASE_URL).
 *   npm run ops:explain --workspace=app
 * Chạy trên DB đã có dữ liệu thật/đủ lớn (hoặc bản khôi phục của production), KHÔNG chạy trên DB rỗng: DB rỗng luôn chọn Seq Scan.
 * Cờ ⚠ = có quét tuần tự trên bảng > 1000 dòng, ứng viên thêm chỉ mục. EXPLAIN ANALYZE chạy truy vấn thật nhưng chỉ đọc.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
type Plan = { Plan: Node; "Execution Time": number };
type Node = { "Node Type": string; "Relation Name"?: string; "Actual Rows"?: number; "Plan Rows"?: number; Plans?: Node[] };

const QUERIES: [string, string][] = [
  ["Bảng điểm một học sinh trong kỳ", `SELECT * FROM "ScoreEntry" WHERE "studentId" = (SELECT "studentId" FROM "ScoreEntry" LIMIT 1) AND "academicTermId" = (SELECT "academicTermId" FROM "ScoreEntry" LIMIT 1)`],
  ["Danh sách lớp theo năm học", `SELECT * FROM "StudentClassEnrollment" WHERE "schoolClassId" = (SELECT "id" FROM "SchoolClass" LIMIT 1) AND "academicYearId" = (SELECT "academicYearId" FROM "SchoolClass" LIMIT 1)`],
  ["Nhật ký hoạt động mới nhất", `SELECT * FROM "ActivityLog" ORDER BY "createdAt" DESC LIMIT 50`],
  ["Lọc nhật ký theo loại + thời gian", `SELECT * FROM "ActivityLog" WHERE "targetType" = 'User' ORDER BY "createdAt" DESC LIMIT 50`],
  ["Bài tập của một lớp-môn", `SELECT * FROM "LessonPost" WHERE "assignmentId" = (SELECT "id" FROM "ClassSubjectAssignment" LIMIT 1)`],
  ["Thời khoá biểu một lớp trong phiên bản", `SELECT * FROM "TimetableSlot" WHERE "schoolClassId" = (SELECT "id" FROM "SchoolClass" LIMIT 1) AND "versionId" = (SELECT "versionId" FROM "TimetableSlot" LIMIT 1)`],
  ["Bài làm của học sinh", `SELECT * FROM "AssignmentSubmission" WHERE "studentId" = (SELECT "id" FROM "Student" LIMIT 1)`],
  ["Hàng đợi việc đến hạn", `SELECT * FROM "Job" WHERE "status" = 'PENDING' AND "runAt" <= NOW() ORDER BY "runAt" LIMIT 1`],
];

function seqScans(node: Node, out: string[] = []): string[] {
  if (node["Node Type"] === "Seq Scan" && node["Relation Name"] && (node["Plan Rows"] ?? 0) > 1000) out.push(`${node["Relation Name"]} (~${node["Plan Rows"]} dòng)`);
  node.Plans?.forEach((p) => seqScans(p, out));
  return out;
}

async function main() {
  let flagged = 0;
  for (const [name, sql] of QUERIES) {
    const rows = await prisma.$queryRawUnsafe<{ "QUERY PLAN": Plan[] }[]>(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`);
    const plan = rows[0]["QUERY PLAN"][0];
    const scans = seqScans(plan.Plan);
    if (scans.length) flagged++;
    console.log(`${scans.length ? "⚠" : "✓"} ${plan["Execution Time"].toFixed(2).padStart(8)} ms  ${name}${scans.length ? `  ← Seq Scan: ${scans.join(", ")}` : ""}`);
  }
  console.log(flagged ? `\n${flagged} truy vấn cần xem xét chỉ mục.` : "\nKhông có truy vấn nào quét tuần tự bảng lớn.");
}

main().finally(() => prisma.$disconnect());
