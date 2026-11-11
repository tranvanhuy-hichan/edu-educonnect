/**
 * Dữ liệu demo cho chức năng Bài học: giaovien@sonha.edu.vn dạy Vật lý/Hóa học nhiều lớp (10A1, 10A2, 11A1, 11A2) ở HK1 + HK2,
 * hocsinh1@sonha.edu.vn (lớp 10A1) thấy bài học theo môn/học kỳ. Chạy lại nhiều lần không tạo trùng.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const D = (s: string) => new Date(s + "T00:00:00Z");

async function main() {
  const teacher = await prisma.teacher.findFirstOrThrow({ where: { user: { email: "giaovien@sonha.edu.vn" } } });
  const student = await prisma.student.findFirstOrThrow({ where: { user: { email: "hocsinh1@sonha.edu.vn" } } });
  const hk1 = await prisma.academicTerm.findFirstOrThrow({ where: { termName: "HK1", academicYear: { yearName: "2026-2027" } } });
  let hk2 = await prisma.academicTerm.findFirst({ where: { termName: "HK2", academicYearId: hk1.academicYearId } });
  hk2 ??= await prisma.academicTerm.create({ data: { academicYearId: hk1.academicYearId, termName: "HK2", startDate: D("2027-01-16"), endDate: D("2027-05-31") } });
  const subj = async (subjectName: string) => prisma.subject.findUniqueOrThrow({ where: { subjectName } });
  const cls = async (className: string) => prisma.schoolClass.findFirstOrThrow({ where: { className, academicYearId: hk1.academicYearId } });

  // [môn, kỳ, các lớp]
  const plan: [string, typeof hk1, string[]][] = [
    ["Vật lý", hk1, ["10A1", "10A2", "11A1", "11A2"]],
    ["Hóa học", hk1, ["10A1", "10A2", "11A2"]],
    ["Vật lý", hk2, ["10A1", "11A1"]],
    ["Toán", hk2, ["11A1"]],
  ];
  const assignments: { id: string; className: string; subject: string; term: string }[] = [];
  for (const [subjectName, term, classNames] of plan) {
    const s = await subj(subjectName);
    for (const className of classNames) {
      const c = await cls(className);
      await prisma.classSubject.upsert({ where: { schoolClassId_subjectId: { schoolClassId: c.id, subjectId: s.id } }, update: {}, create: { schoolClassId: c.id, subjectId: s.id } });
      const a = await prisma.classSubjectAssignment.upsert({
        where: { schoolClassId_subjectId_academicTermId: { schoolClassId: c.id, subjectId: s.id, academicTermId: term.id } },
        update: { teacherId: teacher.id }, create: { schoolClassId: c.id, subjectId: s.id, teacherId: teacher.id, academicTermId: term.id },
      });
      assignments.push({ id: a.id, className, subject: subjectName, term: term.termName });
    }
  }

  // Môn phụ trách: mọi giáo viên đang có phân công thì phụ trách các môn đó (giáo viên chỉ được phân công môn mình phụ trách)
  const all = await prisma.classSubjectAssignment.findMany({ select: { teacherId: true, subjectId: true }, distinct: ["teacherId", "subjectId"] });
  await prisma.teacherSubject.createMany({ data: all, skipDuplicates: true });

  // Hồ sơ cá nhân đầy đủ cho 2 tài khoản demo
  await prisma.teacher.update({ where: { id: teacher.id }, data: { gender: "FEMALE", dob: D("1985-04-18"), contactEmail: "hoa.le@gmail.com", phone: teacher.phone ?? "0912345678", address: "12 Nguyễn Trãi, Thanh Xuân, Hà Nội", idNumber: "001185012345", degree: "Thạc sĩ Sư phạm Vật lý", startDate: D("2010-09-01"), note: "Tổ trưởng chuyên môn Khoa học tự nhiên." } });
  await prisma.student.update({ where: { id: student.id }, data: { gender: "MALE", birthPlace: "Hà Nội", ethnicity: "Kinh", idNumber: "001211012345", phone: "0987654321", contactEmail: "cuong.le@gmail.com", address: "25 Lê Văn Lương, Thanh Xuân, Hà Nội", guardianName: "Lê Văn Hùng", guardianPhone: "0911111111", guardianRelation: "Bố", guardianEmail: "hung.le@gmail.com", guardianJob: "Kỹ sư xây dựng", note: "Học sinh tích cực, thích môn Vật lý." } });

  // Bài học: mỗi bài đăng cho tất cả lớp của cùng môn + kỳ (đúng như khi đăng nhiều lớp)
  const lessons: { subject: string; term: string; title: string; content: string; exercise?: { title: string; content: string; due: string } }[] = [
    { subject: "Vật lý", term: "HK1", title: "Chương 1: Động học chất điểm", content: "Chuyển động thẳng đều, thẳng biến đổi đều. Đọc SGK trang 8–25.", exercise: { title: "Bài tập chương 1", content: "Làm bài 1–6 trang 25 SGK.", due: "2026-11-20" } },
    { subject: "Vật lý", term: "HK1", title: "Chương 2: Động lực học", content: "Ba định luật Newton và ứng dụng.", exercise: { title: "Bài tập định luật Newton", content: "Giải 5 bài tập trong phiếu học tập.", due: "2026-12-05" } },
    { subject: "Vật lý", term: "HK1", title: "Ôn tập giữa kỳ 1", content: "Tổng hợp kiến thức chương 1–2." },
    { subject: "Hóa học", term: "HK1", title: "Bài 1: Cấu tạo nguyên tử", content: "Hạt nhân, electron, số khối, đồng vị.", exercise: { title: "Bài tập cấu tạo nguyên tử", content: "Hoàn thành phiếu bài tập 1.", due: "2026-11-25" } },
    { subject: "Hóa học", term: "HK1", title: "Bài 2: Bảng tuần hoàn", content: "Quy luật biến đổi tính chất trong chu kỳ, nhóm." },
    { subject: "Vật lý", term: "HK2", title: "Chương 3: Công và năng lượng", content: "Công, công suất, động năng, thế năng.", exercise: { title: "Bài tập công và năng lượng", content: "Bài 1–5 trang 60.", due: "2027-02-10" } },
    { subject: "Toán", term: "HK2", title: "Chương 4: Hàm số mũ và logarit", content: "Định nghĩa, tính chất, đồ thị." },
  ];
  let created = 0;
  for (const l of lessons) {
    for (const a of assignments.filter((x) => x.subject === l.subject && x.term === l.term)) {
      let post = await prisma.lessonPost.findFirst({ where: { assignmentId: a.id, title: l.title } });
      if (!post) { post = await prisma.lessonPost.create({ data: { assignmentId: a.id, title: l.title, content: l.content } }); created++; }
      if (l.exercise && !(await prisma.exercise.findFirst({ where: { lessonPostId: post.id } })))
        await prisma.exercise.create({ data: { lessonPostId: post.id, title: l.exercise.title, content: l.exercise.content, dueDate: D(l.exercise.due) } });
    }
  }

  // Tương tác của hocsinh1 ở lớp 10A1: đã xem vài bài, nộp 1 bài (đã chấm), nộp 1 bài (chờ chấm), còn lại chưa nộp
  const mine = await prisma.lessonPost.findMany({ where: { assignment: { id: { in: assignments.filter((x) => x.className === "10A1").map((x) => x.id) } } }, include: { exercises: true }, orderBy: { createdAt: "asc" } });
  for (const p of mine.filter((p) => ["Chương 1: Động học chất điểm", "Chương 2: Động lực học", "Bài 1: Cấu tạo nguyên tử"].includes(p.title)))
    await prisma.lessonPostView.upsert({ where: { lessonPostId_studentId: { lessonPostId: p.id, studentId: student.id } }, update: {}, create: { lessonPostId: p.id, studentId: student.id } });
  const submit = async (title: string, grade: number | null) => {
    const ex = mine.find((p) => p.title === title)?.exercises[0];
    if (!ex) return;
    await prisma.assignmentSubmission.upsert({
      where: { exerciseId_studentId: { exerciseId: ex.id, studentId: student.id } }, update: {},
      create: { exerciseId: ex.id, studentId: student.id, content: "Em đã làm xong, mong thầy/cô xem giúp.", grade, feedback: grade == null ? null : "Làm tốt, cần trình bày rõ hơn bước biến đổi." },
    });
  };
  await submit("Chương 1: Động học chất điểm", 8.5);
  await submit("Chương 2: Động lực học", null);

  // Một số học sinh khác trong các lớp đã xem để cột "Đã xem" của giáo viên có số liệu
  const others = await prisma.student.findMany({ where: { id: { not: student.id }, enrollments: { some: { academicYearId: hk1.academicYearId } } }, take: 8 });
  const allPosts = await prisma.lessonPost.findMany({ where: { assignment: { id: { in: assignments.map((a) => a.id) } }, title: { startsWith: "Chương 1" } }, include: { assignment: { include: { schoolClass: { include: { enrollments: true } } } } } });
  for (const p of allPosts) for (const e of p.assignment.schoolClass.enrollments.slice(0, 8)) if (e.studentId !== student.id)
    await prisma.lessonPostView.upsert({ where: { lessonPostId_studentId: { lessonPostId: p.id, studentId: e.studentId } }, update: {}, create: { lessonPostId: p.id, studentId: e.studentId } });
  void others;

  // Nghỉ học của hocsinh1 (hiện ở cổng sổ liên lạc phụ huynh): vắng không phép ở tiết gần nhất, có phép ở một tiết khác
  const logs = await prisma.classPeriodLog.findMany({ where: { schoolClass: { enrollments: { some: { studentId: student.id } } } }, orderBy: { logDate: "desc" }, take: 4 });
  for (const [i, log] of logs.slice(0, 3).entries()) {
    await prisma.classPeriodAbsence.upsert({ where: { logId_studentId: { logId: log.id, studentId: student.id } }, update: {}, create: { logId: log.id, studentId: student.id, excused: i === 1 } });
    const n = await prisma.classPeriodAbsence.count({ where: { logId: log.id } });
    await prisma.classPeriodLog.update({ where: { id: log.id }, data: { attendanceAbsentCount: Math.max(log.attendanceAbsentCount, n) } });
  }

  console.log(`Đã seed bài học: +${created} bài học mới, ${assignments.length} phân công cho giaovien (HK1 + HK2).`);
}
main().finally(() => prisma.$disconnect());
