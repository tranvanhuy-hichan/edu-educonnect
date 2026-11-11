/**
 * Dữ liệu demo cho "Xét lên lớp" của lớp 10A1: đủ điểm HK1 + HK2 mọi môn, đánh giá rèn luyện và số buổi nghỉ cả năm.
 * Không xóa điểm cũ — chỉ bổ sung phần còn thiếu. Chạy lại nhiều lần không tạo trùng.
 * Sau khi seed, vào Xét lên lớp → lớp 10A1 → bấm "Tổng hợp và trình duyệt" để thử luồng duyệt.
 */
import { PrismaClient } from "@prisma/client";
import { requiredRegularScores, semesterAverage } from "../src/modules/scoring/annual";
const prisma = new PrismaClient();

// Mỗi học sinh một mức học lực (theo thứ tự tên): giỏi, khá, yếu (→ cần đánh giá lại), trung bình, khá...
const BASE = [8.8, 7.4, 3.6, 6.4, 7.8, 8.2, 6.8, 5.8];
const noise = (seed: number) => ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1; // 0..1 ổn định theo seed
const score = (base: number, seed: number) => Math.min(10, Math.max(0, Math.round((base + (noise(seed) - 0.5) * 1.6) * 10) / 10));
const conductOf = (base: number) => (base >= 8 ? "Tốt" : base >= 6.8 ? "Khá" : base >= 5 ? "Đạt" : "Chưa đạt");

async function main() {
  const year = await prisma.academicYear.findFirstOrThrow({ where: { yearName: "2026-2027" }, include: { terms: true } });
  const hk1 = year.terms.find((t) => t.termName === "HK1")!, hk2 = year.terms.find((t) => t.termName === "HK2")!;
  // Quy tắc xếp loại học lực cần tối thiểu 6 môn tính điểm, nên bổ sung các môn còn thiếu cho lớp 10A1 (kèm giáo viên phụ trách).
  const extra: [string, string][] = [["Sinh học", "Lê Thị Hoa"], ["Lịch sử", "Nguyễn Văn An"], ["Địa lý", "Trần Thị Bình"], ["Tin học", "Lê Thị Hoa"]];
  const cls0 = await prisma.schoolClass.findFirstOrThrow({ where: { className: "10A1", academicYearId: year.id } });
  for (const [subjectName, teacherName] of extra) {
    const subject = await prisma.subject.upsert({ where: { subjectName }, update: {}, create: { subjectName, defaultPeriodsPerWeek: 2, annualPeriods: 70 } });
    const teacher = await prisma.teacher.findFirstOrThrow({ where: { fullName: teacherName } });
    await prisma.teacherSubject.createMany({ data: [{ teacherId: teacher.id, subjectId: subject.id }], skipDuplicates: true });
    await prisma.classSubject.upsert({ where: { schoolClassId_subjectId: { schoolClassId: cls0.id, subjectId: subject.id } }, update: {}, create: { schoolClassId: cls0.id, subjectId: subject.id } });
    await prisma.classSubjectAssignment.upsert({
      where: { schoolClassId_subjectId_academicTermId: { schoolClassId: cls0.id, subjectId: subject.id, academicTermId: hk1.id } },
      update: {}, create: { schoolClassId: cls0.id, subjectId: subject.id, teacherId: teacher.id, academicTermId: hk1.id },
    });
  }
  const cls = await prisma.schoolClass.findFirstOrThrow({ where: { className: "10A1", academicYearId: year.id }, include: { subjects: { include: { subject: true } }, enrollments: { include: { student: true } } } });
  const students = cls.enrollments.map((e) => e.student).sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));

  let added = 0;
  for (const { subject } of cls.subjects) {
    const first = await prisma.classSubjectAssignment.findUniqueOrThrow({ where: { schoolClassId_subjectId_academicTermId: { schoolClassId: cls.id, subjectId: subject.id, academicTermId: hk1.id } } });
    // HK2: cùng giáo viên với HK1 (giáo viên vốn đã phụ trách môn này)
    const second = await prisma.classSubjectAssignment.upsert({
      where: { schoolClassId_subjectId_academicTermId: { schoolClassId: cls.id, subjectId: subject.id, academicTermId: hk2.id } },
      update: {}, create: { schoolClassId: cls.id, subjectId: subject.id, teacherId: first.teacherId, academicTermId: hk2.id },
    });
    const need = requiredRegularScores(subject.annualPeriods);
    for (const [term, a, off] of [[hk1, first, 0], [hk2, second, 1]] as const) {
      for (const [i, s] of students.entries()) {
        const base = BASE[i % BASE.length];
        const seed = i * 31 + subject.subjectName.length * 7 + off * 101;
        const entries = await prisma.scoreEntry.findMany({ where: { studentId: s.id, assignmentId: a.id } });
        const tx = entries.filter((e) => e.scoreType === "THUONG_XUYEN").map((e) => e.value);
        const add = async (scoreType: "THUONG_XUYEN" | "GIUA_KY" | "CUOI_KY", value: number) => { await prisma.scoreEntry.create({ data: { studentId: s.id, assignmentId: a.id, academicTermId: term.id, scoreType, value } }); added++; };
        for (let k = tx.length; k < need; k++) { const v = score(base, seed + k); tx.push(v); await add("THUONG_XUYEN", v); }
        let gk = entries.find((e) => e.scoreType === "GIUA_KY")?.value; if (gk == null) { gk = score(base, seed + 11); await add("GIUA_KY", gk); }
        let ck = entries.find((e) => e.scoreType === "CUOI_KY")?.value; if (ck == null) { ck = score(base, seed + 17); await add("CUOI_KY", ck); }
        const averageValue = semesterAverage(tx, gk, ck, need);
        if (averageValue != null) await prisma.subjectTermAverage.upsert({
          where: { studentId_assignmentId_academicTermId: { studentId: s.id, assignmentId: a.id, academicTermId: term.id } },
          update: { averageValue }, create: { studentId: s.id, assignmentId: a.id, academicTermId: term.id, averageValue },
        });
      }
    }
  }

  // Rèn luyện + số buổi nghỉ cả năm (chưa tổng hợp: giáo viên bấm "Tổng hợp và trình duyệt" để thử). Học sinh thứ 4 nghỉ nhiều → "Ở lại".
  for (const [i, s] of students.entries()) {
    const existing = await prisma.yearEndResult.findUnique({ where: { studentId_academicYearId: { studentId: s.id, academicYearId: year.id } } });
    if (existing?.reviewStatus === "APPROVED") continue;
    const data = { conductRank: conductOf(BASE[i % BASE.length]), absenceDays: i === 3 ? 52 : (i * 5 + 2) % 13 };
    await prisma.yearEndResult.upsert({
      where: { studentId_academicYearId: { studentId: s.id, academicYearId: year.id } },
      update: data, create: { studentId: s.id, academicYearId: year.id, result: "CHUA_DU_DIEU_KIEN", ...data },
    });
  }
  console.log(`Đã seed xét lên lớp 10A1: ${students.length} học sinh, ${cls.subjects.length} môn, +${added} điểm mới, HK2 đã có phân công đủ môn.`);
}
main().finally(() => prisma.$disconnect());
