import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { runDailyReminders, tomorrowRangeVN } from "../src/modules/reminders/reminders.service";
import { accountReview, lockAccounts } from "../src/modules/admin/account-review.service";
import * as sessions from "../src/modules/auth/session.repository";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });
const tag = () => `rm${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const phone = () => `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const noon = (now: Date) => new Date(tomorrowRangeVN(now).start.getTime() + 5 * 3_600_000); // 12:00 giờ VN ngày mai

test("database: book, assignment and exam reminders go to the right people exactly once", { skip: !enabled }, async () => {
  const now = new Date();
  const t = tag();
  const assignment = await prisma.classSubjectAssignment.findFirstOrThrow({ include: { schoolClass: true, academicTerm: true, teacher: true, subject: true }, where: { schoolClass: { enrollments: { some: {} } } } });
  const enrolled = await prisma.studentClassEnrollment.findMany({ where: { schoolClassId: assignment.schoolClassId, academicYearId: assignment.academicTerm.academicYearId }, include: { student: true }, take: 3 });
  assert.ok(enrolled.length >= 2, "seed phải có lớp ≥ 2 học sinh");
  const [s1, s2] = [enrolled[0].student, enrolled[1].student];
  const original = await prisma.student.findMany({ where: { id: { in: [s1.id, s2.id] } }, select: { id: true, guardianPhone: true } });
  const ph = phone(); const key = ph.slice(-9);
  await prisma.student.update({ where: { id: s1.id }, data: { guardianPhone: ph } });
  const startedAt = new Date(Date.now() - 1000);
  const made: { loan?: string; post?: string; event?: string } = {};
  const countFor = (userId: string | null, type: string, title: RegExp) => prisma.notification.findMany({ where: { userId: userId!, type, createdAt: { gte: startedAt } } }).then((r) => r.filter((n) => title.test(n.title)).length);
  try {
    // ── Sách đến hạn trả ngày mai ──
    const copy = await prisma.libraryBookCopy.findFirstOrThrow();
    const loan = await prisma.libraryLoan.create({ data: { bookCopyId: copy.id, studentId: s1.id, dueDate: noon(now), status: "BORROWED" } });
    made.loan = loan.id;
    // ── Bài tập hết hạn ngày mai: s1 đã nộp, các em khác chưa ──
    const post = await prisma.lessonPost.create({ data: { assignmentId: assignment.id, title: `P ${t}`, content: "x" } });
    made.post = post.id;
    const ex = await prisma.exercise.create({ data: { lessonPostId: post.id, title: `BT ${t}`, content: "x", dueDate: noon(now) } });
    await prisma.assignmentSubmission.create({ data: { exerciseId: ex.id, studentId: s2.id } });
    // ── Lịch thi ngày mai: đã công bố (có nhắc) và nháp (không nhắc) ──
    const mkEvent = async (status: "PUBLISHED" | "DRAFT") => {
      const ev = await prisma.examEvent.create({ data: { title: `Thi ${t} ${status}`, category: "GK", academicTermId: assignment.academicTermId, gradeLevelId: assignment.schoolClass.gradeLevelId, status, createdBy: "test" } });
      const paper = await prisma.examPaper.create({ data: { eventId: ev.id, subjectId: assignment.subjectId, grouping: "CLASS", startsAt: new Date(noon(now).getTime() - 4 * 3_600_000), endsAt: new Date(noon(now).getTime() - 3_000_000) } });
      const room = await prisma.examRoom.create({ data: { paperId: paper.id, groupKey: "g1", label: `Phong-${status}` } });
      await prisma.examSeat.create({ data: { paperId: paper.id, examRoomId: room.id, studentId: s1.id, registrationNo: `R${t}${status}`, seatNo: 1, fullName: s1.fullName, studentCode: s1.code ?? "x", className: assignment.schoolClass.className } });
      await prisma.examInvigilation.create({ data: { examRoomId: room.id, teacherId: assignment.teacherId, position: 1 } });
      return ev.id;
    };
    const published = await mkEvent("PUBLISHED"); const draft = await mkEvent("DRAFT");
    made.event = published;

    const r1 = await runDailyReminders(now);
    assert.ok(r1.books >= 1 && r1.assignments >= 1 && r1.exams >= 2, JSON.stringify(r1));
    assert.equal(await countFor(s1.userId, "LIBRARY", /Sách sắp đến hạn/), 1);
    assert.equal(await countFor(s1.userId, "ASSIGNMENT", /Bài tập sắp hết hạn/), 1, "s1 chưa nộp");
    assert.equal(await countFor(s2.userId, "ASSIGNMENT", /Bài tập sắp hết hạn/), 0, "s2 đã nộp thì không nhắc");
    const examNote = (await prisma.notification.findMany({ where: { userId: s1.userId!, type: "EXAM", createdAt: { gte: startedAt } } }));
    assert.equal(examNote.length, 1);
    assert.match(examNote[0].content, /Phong-PUBLISHED/);
    assert.ok(!examNote.some((n) => /Phong-DRAFT/.test(n.content)), "lịch thi nháp không được nhắc");
    assert.equal(await countFor(assignment.teacher.userId, "EXAM", /coi thi/), 1);
    const parent = await prisma.parentNotification.findMany({ where: { phoneKey: key, createdAt: { gte: startedAt } } });
    assert.ok(parent.some((n) => n.type === "LIBRARY") && parent.some((n) => n.type === "ASSIGNMENT") && parent.some((n) => n.type === "EXAM"), "phụ huynh nhận cả ba loại: " + parent.map((n) => n.type));

    // chạy lại: không gửi trùng
    const r2 = await runDailyReminders(now);
    assert.equal(r2.books + r2.assignments + r2.exams, 0);
    assert.equal(await countFor(s1.userId, "LIBRARY", /Sách sắp đến hạn/), 1);
    assert.equal(await prisma.examEvent.count({ where: { id: draft } }), 1);
  } finally {
    await prisma.notification.deleteMany({ where: { createdAt: { gte: startedAt }, type: { in: ["LIBRARY", "ASSIGNMENT", "EXAM"] } } });
    await prisma.parentNotification.deleteMany({ where: { phoneKey: key } });
    await prisma.$executeRaw`DELETE FROM "ReminderSent" WHERE "createdAt" >= ${startedAt}`;
    await prisma.examEvent.deleteMany({ where: { title: { startsWith: `Thi ${t}` } } });
    await prisma.assignmentSubmission.deleteMany({ where: { exercise: { lessonPostId: made.post ?? "x" } } });
    await prisma.exercise.deleteMany({ where: { lessonPostId: made.post ?? "x" } });
    await prisma.lessonPost.deleteMany({ where: { id: made.post ?? "x" } });
    await prisma.libraryLoan.deleteMany({ where: { id: made.loan ?? "x" } });
    for (const o of original) await prisma.student.update({ where: { id: o.id }, data: { guardianPhone: o.guardianPhone } });
  }
});

test("database: account review lists stale, never-used, idle-teacher and class-less accounts; locking logs them out and skips the admin themself", { skip: !enabled }, async () => {
  const t = tag();
  const day = 86_400_000;
  const mk = (suffix: string, data: object) => prisma.user.create({ data: { email: `${t}${suffix}@test.invalid`, passwordHash: "x", roles: ["LIBRARIAN"], ...data }, include: { teacher: true, student: true } });
  const admin = await mk("adm", { roles: ["ADMIN"], lastLoginAt: new Date() });
  const tracker = await mk("trk", { lastLoginAt: new Date(Date.now() - 45 * day) }); // đã ghi nhận đăng nhập từ 45 ngày trước → "chưa từng" có nghĩa
  const stale = await mk("old", { lastLoginAt: new Date(Date.now() - 120 * day) });
  const fresh = await mk("new", { lastLoginAt: new Date(Date.now() - 2 * day) });
  const never = await mk("nev", { createdAt: new Date(Date.now() - 40 * day) });
  const newcomer = await mk("nw2", {});
  const idle = await mk("gv", { roles: ["SUBJECT_TEACHER"], teacher: { create: { fullName: `GV nhan roi ${t}` } } });
  const leaver = await mk("hs", { roles: ["STUDENT"], student: { create: { fullName: `HS chua xep lop ${t}`, code: `HS${t}`.toUpperCase().slice(0, 14) } } });
  const sys = { userId: admin.id, email: admin.email, roles: ["ADMIN" as const], teacherId: null, studentId: null };
  const ids = [admin, tracker, stale, fresh, never, newcomer, idle, leaver].map((u) => u.id);
  try {
    const r = await accountReview(sys);
    const has = (rows: { id: string }[], id: string) => rows.some((x) => x.id === id);
    assert.equal(r.trackingReady, true);
    assert.ok(has(r.stale, stale.id), "120 ngày không đăng nhập");
    assert.ok(!has(r.stale, tracker.id), "45 ngày chưa đáng nghi");
    assert.ok(!has(r.stale, fresh.id) && !has(r.stale, admin.id), "mới đăng nhập và chính admin không bị liệt kê");
    assert.ok(has(r.neverLoggedIn, never.id), "tạo > 30 ngày chưa từng đăng nhập");
    assert.ok(!has(r.neverLoggedIn, newcomer.id), "tài khoản mới tạo chưa đáng nghi");
    assert.ok(has(r.idleTeachers, idle.id), "giáo viên không có phân công");
    assert.ok(has(r.leftStudents, leaver.id), "học sinh chưa xếp lớp");
    await assert.rejects(accountReview({ ...sys, roles: ["PRINCIPAL"] }), /Quản trị hệ thống/);

    const s = await sessions.createSession(stale.id, "Chrome trên Windows", "1.2.*.*");
    const n = await lockAccounts(sys, [stale.id, idle.id, admin.id, stale.id]);
    assert.equal(n, 2, "bỏ qua chính admin và id trùng");
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: stale.id } })).isActive, false);
    assert.equal(await prisma.user.findUniqueOrThrow({ where: { id: admin.id } }).then((u) => u.isActive), true);
    assert.ok((await prisma.userSession.findUniqueOrThrow({ where: { id: s.id } })).revokedAt, "khoá là đăng xuất luôn");
    assert.equal(await prisma.activityLog.count({ where: { action: "deactivate_user", targetId: stale.id } }), 1);
    assert.equal((await accountReview(sys)).stale.some((x) => x.id === stale.id), false, "đã khoá thì không còn trong danh sách");

    // ngày 1 hằng tháng: nhắc admin một lần (đã có giáo viên chưa phân công ⇒ có việc để rà soát)
    const first = new Date("2027-03-01T05:00:00Z");
    await runDailyReminders(first);
    const notes = () => prisma.notification.count({ where: { userId: admin.id, title: "Đến kỳ rà soát tài khoản" } });
    assert.equal(await notes(), 1);
    await runDailyReminders(first);
    assert.equal(await notes(), 1, "chạy lại không nhắc trùng");
    await runDailyReminders(new Date("2027-03-02T05:00:00Z"));
    assert.equal(await notes(), 1, "chỉ nhắc vào ngày 1");
  } finally {
    await prisma.notification.deleteMany({ where: { title: "Đến kỳ rà soát tài khoản" } });
    await prisma.$executeRaw`DELETE FROM "ReminderSent" WHERE "key" LIKE 'review:2027-3:%'`;
    await prisma.activityLog.deleteMany({ where: { targetId: { in: ids } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.student.deleteMany({ where: { userId: { in: ids } } });
    await prisma.teacher.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
});
