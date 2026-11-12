/**
 * Tài khoản phụ huynh demo đầy đủ dữ liệu: phụ huynh của hocsinh1 (Lê Văn Cường, lớp 10A1) — SĐT 0911111111, mật khẩu 123456 (có thêm con thứ hai hs11.01, lớp 11A1).
 * Bổ sung những gì còn thiếu để cổng sổ liên lạc có đủ: điểm, TKB, nghỉ học (seed-lessons), lịch thi, mượn sách, đánh giá năm học.
 * Chạy lại nhiều lần không tạo trùng. Chạy SAU seed-lessons.ts và seed-yearend.ts.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { prepareExamPlan, reviewExamPlan, saveExamPlan, suggestExamResources, transitionExam } from "../src/modules/exams/service";
import type { ExamPlan } from "../src/modules/exams/schema";
const prisma = new PrismaClient();
const PHONE = "0911111111";

async function main() {
  const student = await prisma.student.findFirstOrThrow({ where: { user: { email: "hocsinh1@sonha.edu.vn" } } });

  // 1. Tài khoản phụ huynh (mật khẩu mặc định 123456)
  const hash = await bcrypt.hash("123456", 10);
  const now = new Date();
  const found = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "edu"."ParentAccount" WHERE phone = ${PHONE} LIMIT 1`;
  if (found.length) await prisma.$executeRaw`UPDATE "edu"."ParentAccount" SET "passwordHash" = ${hash}, "updatedAt" = ${now} WHERE phone = ${PHONE}`;
  else await prisma.$executeRaw`INSERT INTO "edu"."ParentAccount" ("id","phone","fullName","passwordHash","createdAt","updatedAt") VALUES (${"pa_" + Date.now().toString(36)}, ${PHONE}, ${"Lê Văn Hùng"}, ${hash}, ${now}, ${now})`;
  await prisma.student.update({ where: { id: student.id }, data: { guardianPhone: PHONE, guardianName: "Lê Văn Hùng" } });

  // 1b. Con thứ hai của cùng phụ huynh (lớp 11A1): cổng sổ liên lạc cho chọn giữa 2 con
  const second = await prisma.student.findFirstOrThrow({ where: { user: { email: "hs11.01@sonha.edu.vn" } } });
  await prisma.student.update({ where: { id: second.id }, data: { guardianPhone: PHONE, guardianName: "Lê Văn Hùng", guardianRelation: "Bố" } });
  const secondLogs = await prisma.classPeriodLog.findMany({ where: { schoolClass: { enrollments: { some: { studentId: second.id } } } }, orderBy: { logDate: "desc" }, take: 2 });
  for (const [i, log] of secondLogs.entries()) {
    await prisma.classPeriodAbsence.upsert({ where: { logId_studentId: { logId: log.id, studentId: second.id } }, update: {}, create: { logId: log.id, studentId: second.id, excused: i === 0 } });
    await prisma.classPeriodLog.update({ where: { id: log.id }, data: { attendanceAbsentCount: Math.max(log.attendanceAbsentCount, await prisma.classPeriodAbsence.count({ where: { logId: log.id } })) } });
  }

  // 2. Mượn sách: 1 cuốn đang mượn, 1 cuốn quá hạn
  const books = [{ code: "SGK-TOAN10", title: "Toán 10 – Tập 1", author: "Nhiều tác giả", category: "Sách giáo khoa" }, { code: "VH-DEMEN", title: "Dế Mèn phiêu lưu ký", author: "Tô Hoài", category: "Văn học" }];
  let n = 0;
  for (const [i, b] of books.entries()) {
    const title = await prisma.libraryBookTitle.upsert({ where: { code: b.code }, update: {}, create: { ...b, totalCopies: 2 } });
    const copyCode = `${b.code}-D1`;
    const copy = await prisma.libraryBookCopy.upsert({ where: { copyCode }, update: {}, create: { bookTitleId: title.id, copyCode, status: "BORROWED" } });
    const loanCode = `DEMO-PH-${i + 1}`;
    if (!(await prisma.libraryLoan.findUnique({ where: { loanCode } }))) {
      const day = 86400_000, overdue = i === 1;
      await prisma.libraryLoan.create({ data: { loanCode, studentId: student.id, bookCopyId: copy.id, borrowedDate: new Date(Date.now() - (overdue ? 30 : 5) * day), dueDate: new Date(Date.now() + (overdue ? -9 : 9) * day), status: overdue ? "OVERDUE" : "BORROWED", items: { create: [{ bookCopyId: copy.id, status: overdue ? "OVERDUE" : "BORROWED" }] } } });
      n++;
    }
  }

  // 3. Lịch thi giữa kỳ Khối 10 (đã công bố) có chỗ ngồi của hocsinh1
  const title = "Thi giữa kỳ I · Khối 10 · 2026–2027";
  let examNote = "đã có sẵn";
  if (!(await prisma.examSeat.count({ where: { studentId: student.id } }))) {
    const [admin, grade, term, subjects] = await Promise.all([
      prisma.user.findFirstOrThrow({ where: { isActive: true, roles: { has: "ADMIN" } }, include: { teacher: true, student: true } }),
      prisma.gradeLevel.findUniqueOrThrow({ where: { gradeName: "Khối 10" } }),
      prisma.academicTerm.findFirstOrThrow({ where: { termName: "HK1", academicYear: { yearName: "2026-2027" } } }),
      prisma.subject.findMany({ where: { subjectName: { in: ["Toán", "Vật lý"] } } }),
    ]);
    const user = { userId: admin.id, email: admin.email, roles: admin.roles, teacherId: admin.teacher?.id ?? null, studentId: admin.student?.id ?? null };
    const paper = (name: string, startsAt: string, durationMinutes: number) => ({ subjectId: subjects.find((s) => s.subjectName === name)!.id, grouping: "CLASS" as const, maxPerRoom: null, roomCount: null, startsAt, durationMinutes, reportMinutes: 15, excludedStudentIds: [], allocations: [] });
    const plan: ExamPlan = { title, category: "GIUA_KY", termId: term.id, gradeId: grade.id, notes: "Lịch thi demo cho cổng phụ huynh.", papers: [paper("Toán", "2026-11-23T08:00", 90), paper("Vật lý", "2026-11-24T08:00", 45)] };
    try {
      const preview = await prepareExamPlan(user, plan);
      const allocated = await suggestExamResources(user, plan, preview.fingerprint, 1);
      await reviewExamPlan(user, allocated, preview.fingerprint);
      const created = await saveExamPlan(user, allocated, preview.fingerprint);
      await transitionExam(user, created.id, "publish");
      examNote = "đã tạo và công bố";
    } catch (e) { examNote = `KHÔNG tạo được: ${(e as Error).message}`; }
  }

  // 4. Đánh giá năm học đã duyệt (demo) để thẻ "Đánh giá năm học" có số liệu
  const year = await prisma.academicYear.findFirstOrThrow({ where: { yearName: "2026-2027" } });
  const avgs = await prisma.subjectTermAverage.findMany({ where: { studentId: student.id, academicTerm: { academicYearId: year.id } } });
  const overall = avgs.length ? Math.round((avgs.reduce((t, a) => t + a.averageValue, 0) / avgs.length) * 10) / 10 : null;
  await prisma.yearEndResult.upsert({
    where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    update: { reviewStatus: "APPROVED", result: "LEN_LOP", overallAverage: overall, conductRank: "Khá", absenceDays: 7, approvedBy: "admin@sonha.edu.vn", approvedAt: new Date() },
    create: { studentId: student.id, academicYearId: year.id, reviewStatus: "APPROVED", result: "LEN_LOP", overallAverage: overall, conductRank: "Khá", absenceDays: 7, approvedBy: "admin@sonha.edu.vn", approvedAt: new Date() },
  });
  console.log(`Phụ huynh demo: ${PHONE} / 123456 · mượn sách +${n} · lịch thi: ${examNote} · đánh giá năm học đã duyệt`);
}
main().finally(() => prisma.$disconnect());
