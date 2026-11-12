import { mondayOf } from "../src/lib/format";
/**
 * Dữ liệu demo đầy đủ cho 1 giáo viên kiêm nhiệm: giaovien@sonha.edu.vn (GVCN lớp 11A1 + GVBM Toán/Vật lý/Hóa học).
 * Chạy sau seed.ts; chạy lại không nhân đôi dữ liệu.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD = "test123";
const day = (iso: string) => new Date(iso);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

async function user(email: string, roles: ("HOMEROOM_TEACHER" | "SUBJECT_TEACHER" | "STUDENT")[]) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const account = await prisma.doanUser.upsert({ where: { username: email }, update: { passwordHash }, create: { username: email, passwordHash, fullName: email, role: "EXTERNAL", mustChangePassword: false } });
  return prisma.user.upsert({ where: { email }, update: { roles }, create: { email, accountId: account.id, roles } });
}

async function main() {
  const year = await prisma.academicYear.findUniqueOrThrow({ where: { yearName: "2026-2027" } });
  const term = await prisma.academicTerm.findFirstOrThrow({ where: { academicYearId: year.id, termName: "HK1" } });
  const grade11 = await prisma.gradeLevel.upsert({ where: { gradeName: "Khối 11" }, update: {}, create: { gradeName: "Khối 11", sortOrder: 11 } });
  const subj = async (subjectName: string, p: number) => prisma.subject.upsert({ where: { subjectName }, update: {}, create: { subjectName, defaultPeriodsPerWeek: p } });
  const [toan, ly, hoa] = [await subj("Toán", 4), await subj("Vật lý", 2), await subj("Hóa học", 2)];
  const room = async (roomName: string, roomType: "THUONG" | "PHONG_MAY" | "PHONG_THI_NGHIEM" = "THUONG") =>
    prisma.room.upsert({ where: { roomName }, update: {}, create: { roomName, roomType: roomType as never, capacity: 40 } });
  const [r103, r104] = [await room("P103"), await room("P104")];

  // ===== Giáo viên =====
  const u = await user("giaovien@sonha.edu.vn", ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"]);
  const teacher = await prisma.teacher.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id, fullName: "Lê Thị Hoa", phone: "0903333333" } });
  if (!teacher.code) {
    const n = await prisma.teacher.count();
    await prisma.teacher.update({ where: { id: teacher.id }, data: { code: `GV${String(n).padStart(6, "0")}` } });
  }

  // ===== Lớp 11A1 (chủ nhiệm) + 11A2 =====
  const cls = async (className: string, homeroom?: string) =>
    prisma.schoolClass.upsert({
      where: { className_academicYearId: { className, academicYearId: year.id } },
      update: homeroom ? { homeroomTeacherId: homeroom } : {},
      create: { className, gradeLevelId: grade11.id, academicYearId: year.id, homeroomTeacherId: homeroom },
    });
  const a1 = await cls("11A1", teacher.id), a2 = await cls("11A2");

  // ===== Học sinh =====
  const names = ["Nguyễn Hoàng Anh", "Trần Minh Bảo", "Lê Ngọc Châu", "Phạm Đức Dũng", "Vũ Thùy Dương", "Đặng Quốc Hải", "Bùi Thanh Hà", "Hoàng Gia Hưng", "Ngô Mai Khanh", "Dương Tuấn Kiệt", "Đỗ Phương Linh", "Lý Hải Long", "Trịnh Bảo Ngân", "Phan Nhật Nam", "Võ Yến Nhi", "Cao Minh Phát", "Tạ Thảo Quyên", "Mai Anh Quân", "Lương Khánh Tâm", "Hà Thu Trang", "Chu Văn Tùng", "Đinh Bích Uyên", "Kiều Thế Vinh", "Âu Lan Vy", "Quách Minh Xuân", "Tô Hải Yến"];
  const studentIds: { id: string; cls: string }[] = [];
  for (const [i, fullName] of names.entries()) {
    const email = `hs11.${String(i + 1).padStart(2, "0")}@sonha.edu.vn`;
    const us = await user(email, ["STUDENT"]);
    const target = i < 18 ? a1 : a2;
    const st = await prisma.student.upsert({
      where: { userId: us.id }, update: {},
      create: { userId: us.id, fullName, dob: day(`2010-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`), guardianName: "Phụ huynh " + fullName.split(" ").pop(), guardianPhone: `09${String(55000000 + i)}` },
    });
    if (!st.code) {
      const codes = await prisma.student.findMany({ where: { code: { not: null } }, select: { code: true } });
      const max = Math.max(0, ...codes.map((c) => Number(c.code!.slice(2))));
      await prisma.student.update({ where: { id: st.id }, data: { code: `HS${String(max + 1).padStart(8, "0")}` } });
    }
    await prisma.studentClassEnrollment.upsert({ where: { studentId_academicYearId: { studentId: st.id, academicYearId: year.id } }, update: {}, create: { studentId: st.id, schoolClassId: target.id, academicYearId: year.id } });
    studentIds.push({ id: st.id, cls: target.id });
  }
  const monitor = studentIds[2];
  await prisma.schoolClass.update({ where: { id: a1.id }, data: { monitorStudentId: monitor.id } });

  // ===== Phân công =====
  const asg = async (schoolClassId: string, subjectId: string) => {
    await prisma.classSubject.upsert({ where: { schoolClassId_subjectId: { schoolClassId, subjectId } }, update: {}, create: { schoolClassId, subjectId } });
    return prisma.classSubjectAssignment.upsert({
      where: { schoolClassId_subjectId_academicTermId: { schoolClassId, subjectId, academicTermId: term.id } },
      update: { teacherId: teacher.id }, create: { schoolClassId, subjectId, teacherId: teacher.id, academicTermId: term.id },
    });
  };
  const toan1 = await asg(a1.id, toan.id), ly1 = await asg(a1.id, ly.id), ly2 = await asg(a2.id, ly.id), hoa2 = await asg(a2.id, hoa.id);
  const toan2 = await asg(a2.id, toan.id);
  const all = [toan1, ly1, ly2, hoa2, toan2];

  const version = await prisma.timetableVersion.upsert({
    where: { academicTermId_startsOn: { academicTermId: term.id, startsOn: mondayOf(term.startDate) } },
    update: {}, create: { academicTermId: term.id, startsOn: mondayOf(term.startDate) },
  });

  // ===== Thời khóa biểu =====
  const slotDefs: [typeof toan1, string, typeof r103, number, number][] = [
    [toan1, a1.id, r103, 2, 3], [toan1, a1.id, r103, 4, 1], [ly1, a1.id, r103, 3, 3], [toan2, a2.id, r104, 3, 4],
    [ly2, a2.id, r104, 5, 2], [hoa2, a2.id, r104, 6, 1], [toan1, a1.id, r103, 5, 4], [ly1, a1.id, r103, 6, 3],
  ];
  const slots = [];
  for (const [a, classId, rm, dow, p] of slotDefs) {
    slots.push(await prisma.timetableSlot.upsert({
      where: { roomId_versionId_dayOfWeek_periodNo: { roomId: rm.id, versionId: version.id, dayOfWeek: dow, periodNo: p } },
      update: {}, create: { versionId: version.id, schoolClassId: classId, assignmentId: a.id, roomId: rm.id, academicTermId: term.id, dayOfWeek: dow, periodNo: p },
    }));
  }

  // ===== Sổ đầu bài: các tuần đã qua (bỏ sót vài tiết để có "chưa ghi") =====
  const start = day("2026-09-07"), end = day("2026-11-09");
  const ratings = ["TOT", "TOT", "KHA", "TOT", "KHA", "TB", "TOT"] as const;
  let k = 0;
  for (const s of slots) {
    for (let d = addDays(start, s.dayOfWeek - 2); d < end; d = addDays(d, 7)) {
      k++;
      if (k % 9 === 0) continue;
      const absent = (k * 5) % 4;
      await prisma.classPeriodLog.upsert({
        where: { timetableSlotId_logDate: { timetableSlotId: s.id, logDate: d } }, update: {},
        create: { timetableSlotId: s.id, schoolClassId: s.schoolClassId, logDate: d, attendanceAbsentCount: absent, conductRating: ratings[k % ratings.length], note: absent ? "Có học sinh vắng, đã nhắc nhở" : "Lớp học tập nghiêm túc" },
      });
    }
  }

  // ===== Điểm: TX×3, GK, CK + điểm TB =====
  const pick = (seed: number, lo: number, hi: number) => Math.round((lo + ((seed * 37) % 100) / 100 * (hi - lo)) * 10) / 10;
  const w = { THUONG_XUYEN: 1, GIUA_KY: 2, CUOI_KY: 3 } as const;
  for (const [i, st] of studentIds.entries()) {
    for (const [j, a] of all.filter((x) => x.schoolClassId === st.cls).entries()) {
      const seed = i * 11 + j * 5;
      const rows: ["THUONG_XUYEN" | "GIUA_KY" | "CUOI_KY", number][] = [["THUONG_XUYEN", pick(seed + 1, 5, 10)], ["THUONG_XUYEN", pick(seed + 2, 5, 10)], ["THUONG_XUYEN", pick(seed + 3, 4, 10)], ["GIUA_KY", pick(seed + 4, 4.5, 9.5)], ["CUOI_KY", pick(seed + 5, 4.5, 9.5)]];
      if (!(await prisma.scoreEntry.findFirst({ where: { studentId: st.id, assignmentId: a.id } }))) {
        for (const [scoreType, value] of rows) await prisma.scoreEntry.create({ data: { studentId: st.id, assignmentId: a.id, academicTermId: term.id, scoreType, value } });
      }
      const averageValue = Math.round((rows.reduce((t, [kk, v]) => t + v * w[kk], 0) / rows.reduce((t, [kk]) => t + w[kk], 0)) * 100) / 100;
      await prisma.subjectTermAverage.upsert({
        where: { studentId_assignmentId_academicTermId: { studentId: st.id, assignmentId: a.id, academicTermId: term.id } },
        update: { averageValue }, create: { studentId: st.id, assignmentId: a.id, academicTermId: term.id, averageValue },
      });
    }
  }

  // ===== Bài học, bài tập, giáo án, bài nộp =====
  const mkPost = async (assignmentId: string, title: string, content: string) =>
    (await prisma.lessonPost.findFirst({ where: { assignmentId, title } })) ?? prisma.lessonPost.create({ data: { assignmentId, title, content } });
  const mkEx = async (lessonPostId: string, title: string, content: string, dueDate?: Date) =>
    (await prisma.exercise.findFirst({ where: { lessonPostId, title } })) ?? prisma.exercise.create({ data: { lessonPostId, title, content, dueDate } });
  const lToan = await mkPost(toan1.id, "Chương 1: Hàm số lượng giác", "Đường tròn lượng giác, giá trị lượng giác của một cung và các công thức cơ bản.");
  const lLy = await mkPost(ly1.id, "Bài 1: Dao động điều hòa", "Phương trình dao động, chu kỳ, tần số, pha ban đầu.");
  const lLy2 = await mkPost(ly2.id, "Bài 1: Dao động điều hòa (11A2)", "Tóm tắt lý thuyết và ví dụ minh họa.");
  const lHoa = await mkPost(hoa2.id, "Bài 1: Sự điện li", "Chất điện li mạnh, yếu và phương trình điện li.");
  const exercises = [
    await mkEx(lToan.id, "Bài tập hàm số lượng giác", "Làm bài 1–8 trang 24 SGK, nộp trước hạn.", day("2026-11-20")),
    await mkEx(lToan.id, "Bài tập đã quá hạn tuần 5", "Ôn tập công thức cộng.", day("2026-10-10")),
    await mkEx(lLy.id, "Bài tập dao động điều hòa", "Giải các bài tập 1–6 trang 9.", day("2026-11-18")),
    await mkEx(lHoa.id, "Bài tập sự điện li", "Hoàn thành phiếu bài tập số 1.", day("2026-11-25")),
  ];
  const inClass = (cid: string) => studentIds.filter((s) => s.cls === cid);
  for (const p of [lToan, lLy, lLy2, lHoa]) {
    const asg = all.find((a) => a.id === p.assignmentId)!;
    const pupils = inClass(asg.schoolClassId);
    for (const s of pupils.slice(0, Math.ceil(pupils.length * 0.7))) {
      await prisma.lessonPostView.upsert({ where: { lessonPostId_studentId: { lessonPostId: p.id, studentId: s.id } }, update: {}, create: { lessonPostId: p.id, studentId: s.id } });
    }
  }
  for (const ex of exercises) {
    const lesson = [lToan, lLy, lLy2, lHoa].find((l) => l.id === ex.lessonPostId)!;
    const asg = all.find((a) => a.id === lesson.assignmentId)!;
    const pupils = inClass(asg.schoolClassId);
    for (const [i, s] of pupils.slice(0, Math.ceil(pupils.length * 0.5)).entries()) {
      await prisma.assignmentSubmission.upsert({
        where: { exerciseId_studentId: { exerciseId: ex.id, studentId: s.id } }, update: {},
        create: { exerciseId: ex.id, studentId: s.id, content: "Em đã hoàn thành bài tập ạ.", ...(i % 3 ? { grade: pick(i + 3, 6, 10), feedback: "Làm tốt, chú ý trình bày." } : {}) },
      });
    }
  }

  // ===== Kết quả cuối năm (một nửa 11A1), thi đua, thư viện =====
  for (const [i, s] of inClass(a1.id).slice(0, 9).entries()) {
    await prisma.yearEndResult.upsert({
      where: { studentId_academicYearId: { studentId: s.id, academicYearId: year.id } }, update: {},
      create: { studentId: s.id, academicYearId: year.id, overallAverage: pick(i + 2, 5.5, 9), conductRank: i % 4 === 3 ? "Khá" : "Tốt", result: i === 8 ? "THI_LAI" : "LEN_LOP" },
    });
  }
  for (const [label, s1, s2] of [["Tuần 1", 74, 69.5], ["Tuần 2", 76.5, 71], ["Tuần 3", 73, 75]] as const) {
    for (const [cid, score] of [[a1.id, s1], [a2.id, s2]] as const) {
      await prisma.classEmulationScore.upsert({
        where: { schoolClassId_academicTermId_periodLabel: { schoolClassId: cid, academicTermId: term.id, periodLabel: label } },
        update: {}, create: { schoolClassId: cid, academicTermId: term.id, periodLabel: label, totalScore: score, rank: (cid === a1.id) === (s1 > s2) ? 1 : 2 },
      });
    }
  }
  const book = await prisma.libraryBookTitle.upsert({ where: { isbn: "SEED-003" }, update: {}, create: { title: "Vật lý đại cương", author: "Nhiều tác giả", isbn: "SEED-003", totalCopies: 3 } });
  for (const [i, status] of (["BORROWED", "AVAILABLE", "AVAILABLE"] as const).entries()) {
    const copy = await prisma.libraryBookCopy.upsert({ where: { copyCode: `SEED-003-0${i + 1}` }, update: {}, create: { bookTitleId: book.id, copyCode: `SEED-003-0${i + 1}`, status } });
    if (status === "BORROWED" && !(await prisma.libraryLoan.findFirst({ where: { bookCopyId: copy.id } }))) {
      await prisma.libraryLoan.create({ data: { bookCopyId: copy.id, studentId: studentIds[0].id, borrowedDate: day("2026-11-02"), dueDate: day("2026-11-16"), status: "BORROWED" } });
    }
  }

  console.log("Đã tạo dữ liệu demo giáo viên: giaovien@sonha.edu.vn / " + PASSWORD + " (GVCN 11A1 + GVBM Toán, Vật lý, Hóa học; 26 học sinh hs11.01–26@sonha.edu.vn)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
