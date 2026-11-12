import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { saveClassScores } from "../src/modules/scoring/gradebook.service";
import { setGradesVisibility } from "../src/modules/scoring/grade-visibility.service";
import { saveClassPeriodLog } from "../src/modules/attendance/attendance.service";
import { countParentUnread, listParentNotifications, markAllParentRead, markParentRead } from "../src/modules/notification/parent-notification.service";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });

const admin = { userId: "t-admin", email: "t-admin@test.invalid", roles: ["ADMIN" as const], teacherId: null, studentId: null };
const KEY = "905123987"; // 9 số cuối của SĐT thử
const PHONE = "0905 123 987";

test("database: scores, grade publication and absences notify students and guardians exactly when they should", { skip: !enabled }, async () => {
  const assignment = await prisma.classSubjectAssignment.findFirstOrThrow({
    where: { subject: { assessmentType: "SCORE" }, timetableSlots: { some: {} }, academicTerm: { isLocked: false, endDate: { gt: new Date() }, startDate: { lte: new Date() } }, schoolClass: { enrollments: { some: { student: { yearEndResults: { none: { reviewStatus: "APPROVED" } } } } } } },
    include: { academicTerm: true, subject: true, schoolClass: { include: { enrollments: { where: { student: { yearEndResults: { none: { reviewStatus: "APPROVED" } } } }, take: 2, include: { student: true } } } } },
  });
  const [e1, e2] = assignment.schoolClass.enrollments;
  const s1 = e1.student, s2 = e2?.student;
  assert.ok(s1.userId);
  const originals = await prisma.student.findMany({ where: { id: { in: [s1.id, ...(s2 ? [s2.id] : [])] } }, select: { id: true, guardianPhone: true } });
  const termBefore = { gradesHidden: assignment.academicTerm.gradesHidden };
  const startedAt = new Date();
  const clean = async () => {
    // công bố điểm tạo thông báo cho mọi học sinh trong năm: dọn hết những gì phát sinh trong bài test
    await prisma.parentNotification.deleteMany({ where: { createdAt: { gte: startedAt } } });
    await prisma.notification.deleteMany({ where: { createdAt: { gte: startedAt } } });
    await prisma.parentNotification.deleteMany({ where: { phoneKey: KEY } });
    await prisma.notification.deleteMany({ where: { userId: s1.userId!, type: "GRADE" } });
  };
  await clean();
  await prisma.student.update({ where: { id: s1.id }, data: { guardianPhone: PHONE } });
  await prisma.academicTerm.update({ where: { id: assignment.academicTermId }, data: { gradesHidden: false } });
  const save = (tx: number[], gk: number | null, ck: number | null) => saveClassScores(admin, { assignmentId: assignment.id, reason: "kiem thu thong bao", rows: [{ studentId: s1.id, tx, gk, ck }] });
  const gradeRows = () => prisma.parentNotification.findMany({ where: { phoneKey: KEY, type: "GRADE" }, orderBy: { createdAt: "asc" } });
  const studentRows = () => prisma.notification.count({ where: { userId: s1.userId!, type: "GRADE" } });
  try {
    // 1. nhập điểm đang hiển thị → báo học sinh + phụ huynh, có nội dung điểm
    await save([8, 9], 7, null);
    let parent = await gradeRows();
    assert.equal(parent.length, 1);
    assert.match(parent[0].content, new RegExp(`em ${s1.fullName}.*TX 8; 9 · GK 7`));
    assert.equal(parent[0].link, `/phu-huynh?child=${s1.id}`);
    assert.equal(await studentRows(), 1);
    // 2. lưu lại đúng như cũ → không báo thêm
    await save([8, 9], 7, null);
    assert.equal((await gradeRows()).length, 1);
    assert.equal(await studentRows(), 1);
    // 3. sửa điểm → báo tiếp
    await save([8, 9], 7, 6);
    assert.equal((await gradeRows()).length, 2);
    assert.equal(await studentRows(), 2);
    // 4. học kỳ đang khoá xem điểm → nhập điểm không báo
    await prisma.academicTerm.update({ where: { id: assignment.academicTermId }, data: { gradesHidden: true } });
    await save([8, 9], 7, 5);
    assert.equal((await gradeRows()).length, 2);
    // 5. công bố điểm → học sinh và phụ huynh đều được báo
    const before = await studentRows();
    await setGradesVisibility(admin, { termId: assignment.academicTermId, hide: false });
    const published = (await gradeRows()).filter((n) => /Đã công bố điểm/.test(n.title));
    assert.equal(published.length, 1);
    assert.match(published[0].content, new RegExp(s1.fullName));
    assert.equal(await studentRows(), before + 1);
    // 6. học sinh không có SĐT người giám hộ hợp lệ → bỏ qua, không lỗi
    if (s2) {
      await prisma.parentNotification.deleteMany({ where: { studentId: s2.id } }); // đã được báo ở bước 5 bằng SĐT cũ
      await prisma.student.update({ where: { id: s2.id }, data: { guardianPhone: "n/a" } });
      await setGradesVisibility(admin, { termId: assignment.academicTermId, hide: true });
      await setGradesVisibility(admin, { termId: assignment.academicTermId, hide: false });
      assert.equal(await prisma.parentNotification.count({ where: { studentId: s2.id } }), 0);
    }
    // 7. phía phụ huynh: đếm chưa đọc, đọc một, đọc tất cả; không đọc được thông báo của số khác
    assert.ok((await countParentUnread(PHONE)) >= 2);
    const list = await listParentNotifications("+84 905 123 987");
    assert.ok(list.length >= 2);
    assert.equal((await markParentRead(list[0].id, "0999 000 111")).count, 0, "SĐT khác không đánh dấu được");
    assert.equal((await markParentRead(list[0].id, PHONE)).count, 1);
    await markAllParentRead(PHONE);
    assert.equal(await countParentUnread(PHONE), 0);
    assert.deepEqual(await listParentNotifications("0999 000 111"), []);

    // 8. vắng mặt → chỉ báo phụ huynh, chỉ báo em mới được ghi vắng
    const slot = await prisma.timetableSlot.findFirst({ where: { assignmentId: assignment.id }, include: { version: true } });
    assert.ok(slot, "dữ liệu seed phải có tiết thời khoá biểu cho môn này");
    {
      const term = assignment.academicTerm;
      let day = new Date(Math.min(Date.now(), term.endDate.getTime()));
      day = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
      for (let i = 0; i < 14 && ((day.getUTCDay() === 0 ? 8 : day.getUTCDay() + 1) !== slot.dayOfWeek); i++) day = new Date(day.getTime() - 86400_000);
      const absenceNotices = () => prisma.parentNotification.findMany({ where: { phoneKey: KEY, type: "ATTENDANCE" } });
      const log = (absences: { studentId: string; excused: boolean }[]) => saveClassPeriodLog(admin, { timetableSlotId: slot.id, logDate: day, attendanceAbsentCount: absences.length, absences });
      await log([{ studentId: s1.id, excused: false }]);
      let notices = await absenceNotices();
      assert.equal(notices.length, 1);
      assert.match(notices[0].content, /vắng tiết \d+ môn .* \(không phép\)/);
      await log([{ studentId: s1.id, excused: true }]); // lưu lại: không báo trùng
      assert.equal((await absenceNotices()).length, 1);
      await log([]);                                     // bỏ ghi vắng: không báo
      assert.equal((await absenceNotices()).length, 1);
      await log([{ studentId: s1.id, excused: true }]); // vắng lại sau khi đã bỏ: là lần vắng mới
      notices = await absenceNotices();
      assert.equal(notices.length, 2);
      assert.match(notices[1].content, /\(có phép\)/);
      assert.equal(await prisma.notification.count({ where: { userId: s1.userId!, type: "ATTENDANCE" } }), 0, "vắng mặt chỉ báo phụ huynh");
      await prisma.classPeriodAbsence.deleteMany({ where: { log: { timetableSlotId: slot.id, logDate: day } } });
      await prisma.classPeriodLog.deleteMany({ where: { timetableSlotId: slot.id, logDate: day } });
    }
  } finally {
    await clean();
    for (const o of originals) await prisma.student.update({ where: { id: o.id }, data: { guardianPhone: o.guardianPhone } });
    await prisma.academicTerm.update({ where: { id: assignment.academicTermId }, data: termBefore });
  }
});
