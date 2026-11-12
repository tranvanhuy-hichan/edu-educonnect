import { mondayOf } from "../src/lib/format";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TEST_PASSWORD = "test123";

async function upsertUser(email: string, roles: Parameters<typeof prisma.user.create>[0]["data"]["roles"]) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: { roles, passwordHash },
    create: { email, passwordHash, roles },
  });
}

async function main() {
  // ===== Năm học / học kỳ / khối =====
  const year = await prisma.academicYear.upsert({
    where: { yearName: "2026-2027" },
    update: {},
    create: {
      yearName: "2026-2027",
      startDate: new Date("2026-09-05"),
      endDate: new Date("2027-05-31"),
    },
  });

  const term1 = await prisma.academicTerm.upsert({
    where: { academicYearId_termName: { academicYearId: year.id, termName: "HK1" } },
    update: {},
    create: {
      academicYearId: year.id,
      termName: "HK1",
      startDate: new Date("2026-09-05"),
      endDate: new Date("2027-01-15"),
    },
  });

  const grade10 = await prisma.gradeLevel.upsert({
    where: { gradeName: "Khối 10" },
    update: {},
    create: { gradeName: "Khối 10", sortOrder: 10 },
  });

  // ===== Phòng học =====
  const room101 = await prisma.room.upsert({
    where: { roomName: "P101" },
    update: {},
    create: { roomName: "P101", roomType: "THUONG", capacity: 40 },
  });

  // ===== Môn học =====
  const subjectToan = await prisma.subject.upsert({
    where: { subjectName: "Toán" },
    update: {},
    create: { subjectName: "Toán", defaultPeriodsPerWeek: 4 },
  });
  const subjectVan = await prisma.subject.upsert({
    where: { subjectName: "Ngữ văn" },
    update: {},
    create: { subjectName: "Ngữ văn", defaultPeriodsPerWeek: 3 },
  });

  // ===== Tài khoản: Hiệu trưởng, Hiệu phó, Thủ thư =====
  await upsertUser("admin@sonha.edu.vn", ["ADMIN"]);
  const principalUser = await upsertUser("hieutruong@sonha.edu.vn", ["PRINCIPAL"]);
  const vicePrincipalUser = await upsertUser("hieupho@sonha.edu.vn", ["VICE_PRINCIPAL"]);
  const librarianUser = await upsertUser("thuthu@sonha.edu.vn", ["LIBRARIAN"]);

  // ===== Giáo viên: 1 GVCN kiêm GVBM Toán, 1 GVBM Văn =====
  const gvcnUser = await upsertUser("gvcn.toan@sonha.edu.vn", ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"]);
  const gvcnTeacher = await prisma.teacher.upsert({
    where: { userId: gvcnUser.id },
    update: {},
    create: { userId: gvcnUser.id, fullName: "Nguyễn Văn An", phone: "0901111111" },
  });

  const gvbmVanUser = await upsertUser("gvbm.van@sonha.edu.vn", ["SUBJECT_TEACHER"]);
  const gvbmVanTeacher = await prisma.teacher.upsert({
    where: { userId: gvbmVanUser.id },
    update: {},
    create: { userId: gvbmVanUser.id, fullName: "Trần Thị Bình", phone: "0902222222" },
  });

  // ===== Lớp 10A1, GVCN = gvcnTeacher =====
  const schoolClass = await prisma.schoolClass.upsert({
    where: { className_academicYearId: { className: "10A1", academicYearId: year.id } },
    update: { homeroomTeacherId: gvcnTeacher.id },
    create: {
      className: "10A1",
      gradeLevelId: grade10.id,
      academicYearId: year.id,
      homeroomTeacherId: gvcnTeacher.id,
    },
  });

  // ===== Phân công giảng dạy =====
  await prisma.classSubject.createMany({ data: [subjectToan.id, subjectVan.id].map((subjectId) => ({ schoolClassId: schoolClass.id, subjectId })), skipDuplicates: true });
  const assignmentToan = await prisma.classSubjectAssignment.upsert({
    where: {
      schoolClassId_subjectId_academicTermId: {
        schoolClassId: schoolClass.id,
        subjectId: subjectToan.id,
        academicTermId: term1.id,
      },
    },
    update: {},
    create: {
      schoolClassId: schoolClass.id,
      subjectId: subjectToan.id,
      teacherId: gvcnTeacher.id,
      academicTermId: term1.id,
    },
  });

  const assignmentVan = await prisma.classSubjectAssignment.upsert({
    where: {
      schoolClassId_subjectId_academicTermId: {
        schoolClassId: schoolClass.id,
        subjectId: subjectVan.id,
        academicTermId: term1.id,
      },
    },
    update: {},
    create: {
      schoolClassId: schoolClass.id,
      subjectId: subjectVan.id,
      teacherId: gvbmVanTeacher.id,
      academicTermId: term1.id,
    },
  });

  // ===== Hệ số điểm mặc định cho kỳ =====
  await prisma.scoreWeightConfig.upsert({
    where: { academicTermId: term1.id },
    update: {},
    create: { academicTermId: term1.id, txWeight: 1, gkWeight: 2, ckWeight: 3 },
  });

  // ===== 3 học sinh =====
  const studentDefs = [
    { email: "hocsinh1@sonha.edu.vn", fullName: "Lê Văn Cường", dob: "2011-03-12", guardianName: "Lê Văn Hùng", guardianPhone: "0911111111" },
    { email: "hocsinh2@sonha.edu.vn", fullName: "Phạm Thị Dung", dob: "2011-05-20", guardianName: "Phạm Văn Nam", guardianPhone: "0922222222" },
    { email: "hocsinh3@sonha.edu.vn", fullName: "Hoàng Văn Em", dob: "2011-07-08", guardianName: "Hoàng Thị Lan", guardianPhone: "0933333333" },
  ];

  for (const def of studentDefs) {
    const user = await upsertUser(def.email, ["STUDENT"]);
    const student = await prisma.student.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        fullName: def.fullName,
        dob: new Date(def.dob),
        guardianName: def.guardianName,
        guardianPhone: def.guardianPhone,
      },
    });
    await prisma.studentClassEnrollment.upsert({
      where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
      update: {},
      create: { studentId: student.id, schoolClassId: schoolClass.id, academicYearId: year.id },
    });
  }

  const version = await prisma.timetableVersion.upsert({
    where: { academicTermId_startsOn: { academicTermId: term1.id, startsOn: mondayOf(term1.startDate) } },
    update: {}, create: { academicTermId: term1.id, startsOn: mondayOf(term1.startDate) },
  });

  // ===== Thời khóa biểu mẫu: Toán thứ 2 tiết 1, Văn thứ 3 tiết 1 =====
  await prisma.timetableSlot.upsert({
    where: {
      roomId_versionId_dayOfWeek_periodNo: {
        roomId: room101.id,
        versionId: version.id,
        dayOfWeek: 2,
        periodNo: 1,
      },
    },
    update: {},
    create: { versionId: version.id,
      schoolClassId: schoolClass.id,
      assignmentId: assignmentToan.id,
      roomId: room101.id,
      academicTermId: term1.id,
      dayOfWeek: 2,
      periodNo: 1,
    },
  });

  await prisma.timetableSlot.upsert({
    where: {
      roomId_versionId_dayOfWeek_periodNo: {
        roomId: room101.id,
        versionId: version.id,
        dayOfWeek: 3,
        periodNo: 1,
      },
    },
    update: {},
    create: { versionId: version.id,
      schoolClassId: schoolClass.id,
      assignmentId: assignmentVan.id,
      roomId: room101.id,
      academicTermId: term1.id,
      dayOfWeek: 3,
      periodNo: 1,
    },
  });

  // ===== Đầu sách thư viện mẫu =====
  const bookTitle = await prisma.libraryBookTitle.upsert({
    where: { isbn: "SEED-001" },
    update: {
      code: "SGK-TOAN-10",
      category: "Sách giáo khoa",
      shelfLocation: "Kệ A1 - Tầng 2",
      publisher: "NXB Giáo Dục",
      publishYear: 2024,
    },
    create: {
      title: "Toán học phổ thông 10",
      code: "SGK-TOAN-10",
      author: "Nhiều tác giả",
      category: "Sách giáo khoa",
      shelfLocation: "Kệ A1 - Tầng 2",
      publisher: "NXB Giáo Dục",
      publishYear: 2024,
      isbn: "SEED-001",
      totalCopies: 3,
    },
  });
  await prisma.libraryBookCopy.upsert({
    where: { copyCode: "SEED-001-01" },
    update: {},
    create: { bookTitleId: bookTitle.id, copyCode: "SEED-001-01", status: "AVAILABLE", condition: "Mới" },
  });
  await prisma.libraryBookCopy.upsert({
    where: { copyCode: "SEED-001-02" },
    update: {},
    create: { bookTitleId: bookTitle.id, copyCode: "SEED-001-02", status: "AVAILABLE", condition: "Mới" },
  });
  await prisma.libraryBookCopy.upsert({
    where: { copyCode: "SEED-001-03" },
    update: {},
    create: { bookTitleId: bookTitle.id, copyCode: "SEED-001-03", status: "AVAILABLE", condition: "Bình thường" },
  });


  // ===== Dữ liệu mẫu phong phú để mọi trang/tab có nội dung xem thử (chạy lại không nhân đôi) =====
  await prisma.teacher.update({ where: { id: gvcnTeacher.id }, data: { code: "GV000001" } });
  await prisma.teacher.update({ where: { id: gvbmVanTeacher.id }, data: { code: "GV000002" } });

  const room102 = await prisma.room.upsert({ where: { roomName: "P102" }, update: {}, create: { roomName: "P102", roomType: "THUONG", capacity: 40 } });
  const subjectAnh = await prisma.subject.upsert({ where: { subjectName: "Tiếng Anh" }, update: {}, create: { subjectName: "Tiếng Anh", defaultPeriodsPerWeek: 3 } });

  // Lớp 10A2 — GVCN là cô Bình (GVBM Văn), có thêm 4 học sinh
  const class10A2 = await prisma.schoolClass.upsert({
    where: { className_academicYearId: { className: "10A2", academicYearId: year.id } },
    update: { homeroomTeacherId: gvbmVanTeacher.id },
    create: { className: "10A2", gradeLevelId: grade10.id, academicYearId: year.id, homeroomTeacherId: gvbmVanTeacher.id },
  });
  const extraStudents = [
    ["hocsinh4@sonha.edu.vn", "Đỗ Minh Phúc", "2011-02-14"], ["hocsinh5@sonha.edu.vn", "Vũ Thu Giang", "2011-09-30"],
    ["hocsinh6@sonha.edu.vn", "Ngô Quốc Huy", "2011-11-03"], ["hocsinh7@sonha.edu.vn", "Bùi Khánh Linh", "2011-06-18"],
  ];
  for (const [email, fullName, dob] of extraStudents) {
    const user = await upsertUser(email, ["STUDENT"]);
    const st = await prisma.student.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, fullName, dob: new Date(dob), guardianName: "Phụ huynh " + fullName.split(" ").pop(), guardianPhone: "0944000000" } });
    await prisma.studentClassEnrollment.upsert({ where: { studentId_academicYearId: { studentId: st.id, academicYearId: year.id } }, update: {}, create: { studentId: st.id, schoolClassId: class10A2.id, academicYearId: year.id } });
  }
  // Mã học sinh dùng để đăng nhập (HS00000001...)
  const everyStudent = await prisma.student.findMany({ orderBy: { fullName: "asc" } });
  for (const [i, st] of everyStudent.entries()) {
    if (!st.code) await prisma.student.update({ where: { id: st.id }, data: { code: `HS${String(i + 1).padStart(8, "0")}` } });
  }

  // Phân công + Anh văn
  const asg = async (schoolClassId: string, subjectId: string, teacherId: string) => {
    await prisma.classSubject.upsert({ where: { schoolClassId_subjectId: { schoolClassId, subjectId } }, update: {}, create: { schoolClassId, subjectId } });
    return prisma.classSubjectAssignment.upsert({
      where: { schoolClassId_subjectId_academicTermId: { schoolClassId, subjectId, academicTermId: term1.id } },
      update: {}, create: { schoolClassId, subjectId, teacherId, academicTermId: term1.id },
    });
  };
  const toan2 = await asg(class10A2.id, subjectToan.id, gvcnTeacher.id);
  const van2 = await asg(class10A2.id, subjectVan.id, gvbmVanTeacher.id);
  const anh1 = await asg(schoolClass.id, subjectAnh.id, gvbmVanTeacher.id);

  // Thời khóa biểu (Thứ 2–7, tiết 1–10)
  const slot = async (cls: string, assignmentId: string, roomId: string, dayOfWeek: number, periodNo: number) =>
    prisma.timetableSlot.upsert({
      where: { roomId_versionId_dayOfWeek_periodNo: { roomId, versionId: version.id, dayOfWeek, periodNo } },
      update: {}, create: { versionId: version.id, schoolClassId: cls, assignmentId, roomId, academicTermId: term1.id, dayOfWeek, periodNo },
    });
  const sToan1b = await slot(schoolClass.id, assignmentToan.id, room101.id, 4, 2);
  await slot(schoolClass.id, assignmentVan.id, room101.id, 5, 3);
  await slot(schoolClass.id, anh1.id, room101.id, 6, 4);
  await slot(class10A2.id, toan2.id, room102.id, 2, 2);
  await slot(class10A2.id, van2.id, room102.id, 3, 2);

  // Điểm: TX×2, GK, CK cho toàn bộ học sinh 2 lớp ở Toán & Văn; tính điểm TB theo hệ số 1/2/3 như service
  const roster = await prisma.studentClassEnrollment.findMany({ where: { academicYearId: year.id }, orderBy: { studentId: "asc" } });
  const pick = (seed: number, lo: number, hi: number) => Math.round((lo + ((seed * 37) % 100) / 100 * (hi - lo)) * 10) / 10;
  for (const [i, en] of roster.entries()) {
    const targets = en.schoolClassId === schoolClass.id ? [assignmentToan, assignmentVan] : [toan2, van2];
    for (const [j, a] of targets.entries()) {
      const seed = i * 7 + j * 3;
      const rows: [ "THUONG_XUYEN" | "GIUA_KY" | "CUOI_KY", number ][] = [["THUONG_XUYEN", pick(seed + 1, 5, 10)], ["THUONG_XUYEN", pick(seed + 2, 5, 10)], ["GIUA_KY", pick(seed + 3, 4.5, 9.5)], ["CUOI_KY", pick(seed + 4, 4.5, 9.5)]];
      if (!(await prisma.scoreEntry.findFirst({ where: { studentId: en.studentId, assignmentId: a.id } }))) {
        for (const [scoreType, value] of rows) await prisma.scoreEntry.create({ data: { studentId: en.studentId, assignmentId: a.id, academicTermId: term1.id, scoreType, value } });
      }
      const w = { THUONG_XUYEN: 1, GIUA_KY: 2, CUOI_KY: 3 } as const;
      const averageValue = Math.round((rows.reduce((t, [k, v]) => t + v * w[k], 0) / rows.reduce((t, [k]) => t + w[k], 0)) * 100) / 100;
      await prisma.subjectTermAverage.upsert({
        where: { studentId_assignmentId_academicTermId: { studentId: en.studentId, assignmentId: a.id, academicTermId: term1.id } },
        update: { averageValue }, create: { studentId: en.studentId, assignmentId: a.id, academicTermId: term1.id, averageValue },
      });
    }
  }

  // Bài học, bài tập, giáo án, lượt xem, bài nộp
  const mkPost = async (assignmentId: string, title: string, content: string) =>
    (await prisma.lessonPost.findFirst({ where: { assignmentId, title } })) ??
    prisma.lessonPost.create({ data: { assignmentId, title, content } });
  const mkExercise = async (lessonPostId: string, title: string, content: string, dueDate?: Date) =>
    (await prisma.exercise.findFirst({ where: { lessonPostId, title } })) ??
    prisma.exercise.create({ data: { lessonPostId, title, content, dueDate } });
  const pLesson = await mkPost(assignmentToan.id, "Bài 1: Mệnh đề và tập hợp", "Nội dung bài học về mệnh đề, tập hợp và các phép toán trên tập hợp.");
  const pHw = await mkExercise(pLesson.id, "Bài tập tuần 1", "Làm bài tập 1–5 trang 12 SGK.", new Date("2026-09-20"));
  await mkPost(assignmentVan.id, "Bài 1: Tổng quan văn học Việt Nam", "Các bộ phận hợp thành và tiến trình phát triển của văn học Việt Nam.");
  const firstTwo = roster.filter((r) => r.schoolClassId === schoolClass.id).slice(0, 2);
  for (const en of firstTwo) {
    await prisma.lessonPostView.upsert({ where: { lessonPostId_studentId: { lessonPostId: pLesson.id, studentId: en.studentId } }, update: {}, create: { lessonPostId: pLesson.id, studentId: en.studentId } });
  }
  await prisma.assignmentSubmission.upsert({
    where: { exerciseId_studentId: { exerciseId: pHw.id, studentId: firstTwo[0].studentId } },
    update: {}, create: { exerciseId: pHw.id, studentId: firstTwo[0].studentId, content: "Em đã làm xong bài 1–5 ạ.", grade: 8.5, feedback: "Trình bày tốt." },
  });

  // Sổ đầu bài
  const sToan1a = await prisma.timetableSlot.findFirst({ where: { schoolClassId: schoolClass.id, assignmentId: assignmentToan.id, dayOfWeek: 2, periodNo: 1 } });
  for (const [d, absent, rating] of [["2026-09-07", 1, "TOT"], ["2026-09-14", 2, "KHA"], ["2026-09-21", 0, "TOT"]] as const) {
    for (const s of [sToan1a, sToan1b]) {
      if (!s) continue;
      await prisma.classPeriodLog.upsert({
        where: { timetableSlotId_logDate: { timetableSlotId: s.id, logDate: new Date(d) } },
        update: {}, create: { timetableSlotId: s.id, schoolClassId: schoolClass.id, logDate: new Date(d), attendanceAbsentCount: absent, conductRating: rating, note: absent ? "Có học sinh vắng" : null },
      });
    }
  }

  // Thi đua (xếp hạng 2 lớp)
  for (const [cls, score, rank] of [[schoolClass.id, 72.5, 1], [class10A2.id, 68.0, 2]] as const) {
    await prisma.classEmulationScore.upsert({
      where: { schoolClassId_academicTermId_periodLabel: { schoolClassId: cls, academicTermId: term1.id, periodLabel: "Tuần 1" } },
      update: { totalScore: score, rank }, create: { schoolClassId: cls, academicTermId: term1.id, periodLabel: "Tuần 1", totalScore: score, rank },
    });
  }
  if (!(await prisma.emulationCriteria.findFirst())) {
    await prisma.emulationCriteria.createMany({ data: [{ criteriaName: "Học tập", weight: 10 }, { criteriaName: "Chuyên cần", weight: 0.5 }, { criteriaName: "Nền nếp", weight: 1 }] });
  }

  // Thư viện: thêm đầu sách + phiếu mượn nhiều sách (có phiếu quá hạn)
  const bookLit = await prisma.libraryBookTitle.upsert({
    where: { isbn: "SEED-002" },
    update: {
      code: "VH-TK-10",
      category: "Văn học - Nghệ thuật",
      shelfLocation: "Kệ B1 - Tầng 1",
      publisher: "NXB Văn Học",
      publishYear: 2023,
    },
    create: {
      title: "Truyện Kiều",
      code: "VH-TK-10",
      author: "Nguyễn Du",
      category: "Văn học - Nghệ thuật",
      shelfLocation: "Kệ B1 - Tầng 1",
      publisher: "NXB Văn Học",
      publishYear: 2023,
      isbn: "SEED-002",
      totalCopies: 2,
    },
  });
  const copyLit = await prisma.libraryBookCopy.upsert({
    where: { copyCode: "SEED-002-01" },
    update: {},
    create: { bookTitleId: bookLit.id, copyCode: "SEED-002-01", status: "BORROWED", condition: "Tốt" },
  });
  await prisma.libraryBookCopy.upsert({
    where: { copyCode: "SEED-002-02" },
    update: {},
    create: { bookTitleId: bookLit.id, copyCode: "SEED-002-02", status: "AVAILABLE", condition: "Mới" },
  });

  const existingOverdueLoan = await prisma.libraryLoan.findFirst({
    where: { loanCode: "PM-202610-001" },
  });
  if (!existingOverdueLoan) {
    const loan = await prisma.libraryLoan.create({
      data: {
        loanCode: "PM-202610-001",
        studentId: everyStudent[0].id,
        borrowedDate: new Date("2026-10-01"),
        dueDate: new Date("2026-10-15"),
        status: "OVERDUE",
        note: "Mượn học chuyên đề văn học",
        items: {
          create: [
            {
              bookCopyId: copyLit.id,
              status: "BORROWED",
            },
          ],
        },
      },
    });
  }

  // Nhật ký mẫu
  if (!(await prisma.activityLog.findFirst())) {
    await prisma.activityLog.create({ data: { actorEmail: "admin@sonha.edu.vn", action: "create_user", targetType: "User", targetId: "seed" } });
  }

  console.log("====================================");
  console.log(`Seed thành công. Tất cả tài khoản dùng chung mật khẩu: ${TEST_PASSWORD}`);
  console.log("- Quản trị hệ thống: admin@sonha.edu.vn");
  console.log("- Hiệu trưởng:  hieutruong@sonha.edu.vn");
  console.log("- Hiệu phó:     hieupho@sonha.edu.vn");
  console.log("- Thủ thư:      thuthu@sonha.edu.vn");
  console.log("- GVCN+GVBM:    gvcn.toan@sonha.edu.vn (chủ nhiệm 10A1, dạy Toán)");
  console.log("- GVBM:         gvbm.van@sonha.edu.vn (dạy Ngữ văn)");
  console.log("- Học sinh:     hocsinh1@sonha.edu.vn, hocsinh2@sonha.edu.vn, hocsinh3@sonha.edu.vn (lớp 10A1), hocsinh4–7@sonha.edu.vn (lớp 10A2) — đăng nhập được bằng email hoặc mã HS00000001...");
  console.log(`\nassignmentToan=${assignmentToan.id}`);
  console.log(`assignmentVan=${assignmentVan.id}`);
  console.log(`schoolClassId=${schoolClass.id}`);
  console.log(`academicTermId=${term1.id}`);
  console.log("====================================");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
