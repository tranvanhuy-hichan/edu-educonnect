import { notifyUsers } from "@/modules/notification/notification.service";
import { notifyGuardians, type GuardianTarget } from "@/modules/notification/parent-notification.service";
import { buildReview } from "@/modules/admin/account-review.service";
import * as accounts from "@/modules/admin/account-review.repository";
import * as repo from "./reminders.repository";

const VN_OFFSET_MS = 7 * 3_600_000; // UTC+7, Việt Nam không có giờ mùa hè

/** [00:00, 24:00) của NGÀY MAI theo giờ Việt Nam, tính bằng UTC. */
export function tomorrowRangeVN(now = new Date()) {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const start = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1) - VN_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
const dayVN = (d: Date) => d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });
const timeVN = (d: Date) => d.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false });

/** Chỉ gửi cho các khoá chưa từng gửi; lỗi giữa chừng thì nhả khoá để lần chạy sau thử lại. */
async function once<T extends { key: string }>(items: T[], send: (fresh: T[]) => Promise<void>): Promise<number> {
  const claimed = await repo.claimKeys(items.map((i) => i.key));
  const fresh = items.filter((i) => claimed.has(i.key));
  if (!fresh.length) return 0;
  try { await send(fresh); } catch (error) { await repo.releaseKeys(fresh.map((i) => i.key)); throw error; }
  return fresh.length;
}
const asTarget = (s: { id: string; fullName: string; guardianPhone: string | null }): GuardianTarget => s;

/** Sách đến hạn trả vào ngày mai → học sinh + phụ huynh (trong ứng dụng). */
async function bookReminders(start: Date, end: Date) {
  const loans = await repo.loansDueBetween(start, end);
  const items = loans.map((l) => ({ key: `loan:${l.id}:${l.dueDate.toISOString().slice(0, 10)}`, loan: l }));
  return once(items, async (fresh) => {
    const titleOf = (l: (typeof loans)[number]) => (l.items.length ? l.items.map((i) => i.bookCopy.bookTitle.title) : [l.bookCopy?.bookTitle.title ?? "Sách"]).join(", ");
    for (const { loan } of fresh) {
      const when = dayVN(loan.dueDate);
      if (loan.student.userId) await notifyUsers([loan.student.userId], { title: "Sách sắp đến hạn trả", content: `Sách “${titleOf(loan)}” cần trả vào ngày mai (${when}). Vui lòng trả đúng hạn.`, type: "LIBRARY", link: "/thu-vien?tab=my-loans" });
    }
    await notifyGuardians(fresh.map((f) => asTarget(f.loan.student)), (s) => {
      const loan = fresh.find((f) => f.loan.student.id === s.id)!.loan;
      return { title: `Em ${s.fullName} có sách sắp đến hạn trả`, content: `Sách “${titleOf(loan)}” của em ${s.fullName} cần trả vào ngày mai (${dayVN(loan.dueDate)}).`, type: "LIBRARY" };
    });
  });
}

/** Bài tập hết hạn nộp vào ngày mai → học sinh trong lớp CHƯA nộp + phụ huynh. */
async function assignmentReminders(start: Date, end: Date) {
  const exercises = await repo.exercisesDueBetween(start, end);
  const items: { key: string; exercise: (typeof exercises)[number]; student: GuardianTarget & { userId: string | null } }[] = [];
  for (const ex of exercises) {
    const a = ex.lessonPost.assignment;
    const submitted = new Set(ex.submissions.map((s) => s.studentId));
    for (const e of await repo.classStudents(a.schoolClassId, a.academicTerm.academicYearId)) {
      if (!submitted.has(e.student.id)) items.push({ key: `due:${ex.id}:${e.student.id}`, exercise: ex, student: e.student });
    }
  }
  return once(items, async (fresh) => {
    const text = (i: (typeof fresh)[number]) => `Bài tập “${i.exercise.title}” (môn ${i.exercise.lessonPost.assignment.subject.subjectName}) hết hạn nộp vào ngày mai (${dayVN(i.exercise.dueDate!)}).`;
    const link = (i: (typeof fresh)[number]) => `/bai-hoc/${i.exercise.lessonPost.id}?tab=bai-tap&ex=${i.exercise.id}`;
    for (const i of fresh) if (i.student.userId) await notifyUsers([i.student.userId], { title: "Bài tập sắp hết hạn nộp", content: `${text(i)} Em chưa nộp bài.`, type: "ASSIGNMENT", link: link(i) });
    // một phụ huynh có thể có nhiều con/nhiều bài: mỗi (em, bài) một thông báo
    for (const i of fresh) await notifyGuardians([asTarget(i.student)], (s) => ({ title: `Em ${s.fullName} chưa nộp bài tập`, content: `${text(i)} Em ${s.fullName} chưa nộp bài.`, type: "ASSIGNMENT" }));
  });
}

/** Lịch thi ngày mai → học sinh có số báo danh, giáo viên coi thi, phụ huynh. */
async function examReminders(start: Date, end: Date) {
  const papers = await repo.examPapersBetween(start, end);
  const students: { key: string; text: string; student: GuardianTarget & { userId: string | null } }[] = [];
  const teachers: { key: string; text: string; userId: string }[] = [];
  for (const p of papers) {
    const when = `${timeVN(p.startsAt)} ngày mai (${dayVN(p.startsAt)})`;
    for (const s of p.seats) {
      const room = s.examRoom.room?.roomName ?? s.examRoom.label;
      students.push({ key: `exam:${p.id}:${s.student.id}`, student: s.student, text: `Thi môn ${p.subject.subjectName} lúc ${when}, phòng ${room}. Có mặt trước ${p.reportMinutes} phút.` });
    }
    for (const r of p.rooms) for (const inv of r.invigilators) if (inv.teacher.userId) {
      teachers.push({ key: `exam-inv:${p.id}:${inv.teacher.id}`, userId: inv.teacher.userId, text: `Bạn coi thi môn ${p.subject.subjectName} lúc ${when}, phòng ${r.room?.roomName ?? r.label}. Có mặt trước ${p.reportMinutes} phút.` });
    }
  }
  const a = await once(students, async (fresh) => {
    for (const i of fresh) if (i.student.userId) await notifyUsers([i.student.userId], { title: "Ngày mai có lịch thi", content: i.text, type: "EXAM" });
    for (const i of fresh) await notifyGuardians([asTarget(i.student)], (s) => ({ title: `Ngày mai em ${s.fullName} có lịch thi`, content: `Em ${s.fullName}: ${i.text}`, type: "EXAM" }));
  });
  const b = await once(teachers, async (fresh) => { for (const i of fresh) await notifyUsers([i.userId], { title: "Ngày mai bạn có lịch coi thi", content: i.text, type: "EXAM" }); });
  return a + b;
}

/** Ngày 1 hằng tháng: nhắc quản trị rà soát tài khoản (chỉ khi có gì cần rà soát). */
async function monthlyReview(now: Date) {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  if (vn.getUTCDate() !== 1) return 0;
  const review = await buildReview("", now);
  if (!review.total) return 0;
  const adminIds = await accounts.adminUserIds();
  return once(adminIds.map((id) => ({ key: `review:${vn.getUTCFullYear()}-${vn.getUTCMonth() + 1}:${id}`, id })), async (fresh) => {
    await notifyUsers(fresh.map((f) => f.id), {
      title: "Đến kỳ rà soát tài khoản",
      content: `${review.stale.length + review.neverLoggedIn.length} tài khoản lâu không đăng nhập, ${review.idleTeachers.length} giáo viên chưa có phân công, ${review.leftStudents.length} học sinh chưa xếp lớp năm học này. Xem và khoá những tài khoản không còn sử dụng.`,
      type: "SYSTEM", link: "/tai-khoan/ra-soat",
    });
  });
}

/** Tác vụ nhắc việc hằng ngày (chạy buổi tối giờ Việt Nam để nhắc việc của ngày mai). */
export async function runDailyReminders(now = new Date()) {
  const { start, end } = tomorrowRangeVN(now);
  const [books, assignments, exams, review] = [await bookReminders(start, end), await assignmentReminders(start, end), await examReminders(start, end), await monthlyReview(now)];
  return { books, assignments, exams, review };
}
