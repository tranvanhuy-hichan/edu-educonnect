/**
 * Nhiều bài kiểm tra với các cài đặt khác nhau để thử trên tài khoản hocsinh1 (lớp 10A1, Vật lý HK1):
 * nhiều lượt, chỉ xem điểm, có giờ làm bài, thi nghiêm túc có giờ + nhiều lượt, luyện tập tự do.
 * Dùng chính các service của ứng dụng; chạy lại nhiều lần không tạo trùng.
 */
import { PrismaClient } from "@prisma/client";
import { addQuestions, createExercise, publishLesson } from "../src/modules/bank/bank.service";

const prisma = new PrismaClient();
type Settings = { showAnswers: "AFTER_SUBMIT" | "AFTER_DUE" | "NEVER"; secureMode: boolean; maxViolations: number; shuffleQuestions: boolean; shuffleOptions: boolean; maxAttempts: number; attemptScoring: "BEST" | "LAST"; timeLimitMinutes: number; allowReview: boolean };
const base: Settings = { showAnswers: "AFTER_SUBMIT", secureMode: false, maxViolations: 3, shuffleQuestions: true, shuffleOptions: true, maxAttempts: 1, attemptScoring: "BEST", timeLimitMinutes: 0, allowReview: true };

const VARIANTS: { lesson: string; title: string; note: string; s: Partial<Settings> }[] = [
  { lesson: "Chuyển động thẳng biến đổi đều", title: "Kiểm tra làm nhiều lần (3 lượt, lấy điểm cao nhất)", note: "Làm tối đa 3 lượt, điểm tính là lượt cao nhất. Đáp án đúng chỉ hiện sau khi dùng hết lượt.", s: { maxAttempts: 3, attemptScoring: "BEST" } },
  { lesson: "Chuyển động thẳng biến đổi đều", title: "Kiểm tra chỉ xem điểm (không cho xem lại bài)", note: "Làm một lần, sau khi nộp chỉ thấy điểm, không xem lại từng câu.", s: { allowReview: false } },
  { lesson: "Rơi tự do", title: "Kiểm tra có giờ 5 phút (hết giờ tự nộp)", note: "Có đồng hồ đếm ngược 5 phút. Hết giờ bài được nộp tự động.", s: { timeLimitMinutes: 5 } },
  { lesson: "Rơi tự do", title: "Thi nghiêm túc có giờ, 2 lượt (lấy lần cuối)", note: "Toàn màn hình, viền đỏ, tối đa 2 vi phạm, 10 phút, làm 2 lượt và lấy điểm lần cuối.", s: { secureMode: true, maxViolations: 2, timeLimitMinutes: 10, maxAttempts: 2, attemptScoring: "LAST" } },
  { lesson: "Chuyển động thẳng đều", title: "Luyện tập tự do (5 lượt, không xáo đề)", note: "Làm tối đa 5 lượt, giữ nguyên thứ tự câu và đáp án, lấy điểm cao nhất.", s: { maxAttempts: 5, shuffleQuestions: false, shuffleOptions: false } },
];

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "giaovien@sonha.edu.vn" }, include: { teacher: true } });
  const teacher = { userId: user.id, email: user.email, roles: ["SUBJECT_TEACHER" as const], teacherId: user.teacher!.id, studentId: null };
  const a = await prisma.classSubjectAssignment.findFirstOrThrow({ where: { teacherId: teacher.teacherId, subject: { subjectName: "Vật lý" }, schoolClass: { className: "10A1" }, academicTerm: { termName: "HK1" } } });
  const due = new Date("2027-12-31T00:00:00Z");
  for (const v of VARIANTS) {
    const lesson = await prisma.libraryLesson.findFirstOrThrow({ where: { teacherId: teacher.teacherId, title: v.lesson, archivedAt: null } });
    let ex = await prisma.libraryExercise.findFirst({ where: { lessonId: lesson.id, title: v.title, archivedAt: null } });
    if (!ex) {
      ex = await createExercise(teacher, lesson.id, { title: v.title, kind: "NORMAL", quizMode: true, instructions: v.note, attachments: [], sourceLessonIds: [], ...base, ...v.s });
      const ids = (await prisma.question.findMany({ where: { libraryLessonId: lesson.id, reviewStatus: "READY", archivedAt: null }, orderBy: { createdAt: "asc" } })).map((q) => q.id);
      await addQuestions(teacher, ex.id, ids, 2);
      console.log(`Đã tạo "${v.title}" (${ids.length} câu).`);
    }
    const r = await publishLesson(teacher, lesson.id, { assignmentIds: [a.id], items: [{ exerciseId: ex.id, dueDate: due }] });
    console.log(` -> đăng cho 10A1:`, r);
  }
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error("LỖI:", e); await prisma.$disconnect(); process.exit(1); });
