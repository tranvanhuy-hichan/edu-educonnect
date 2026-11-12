/**
 * Bài kiểm tra thi nghiêm túc (toàn màn hình, viền đỏ, ghi nhận vi phạm) để thử trên tài khoản hocsinh1 (lớp 10A1).
 * Dùng chính các service của ứng dụng; chạy lại nhiều lần không tạo trùng.
 */
import { PrismaClient } from "@prisma/client";
import { addQuestions, createExercise, publishLesson } from "../src/modules/bank/bank.service";

const prisma = new PrismaClient();
const TITLE = "Kiểm tra thi nghiêm túc (thử nghiệm)";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "giaovien@sonha.edu.vn" }, include: { teacher: true } });
  const teacher = { userId: user.id, email: user.email, roles: ["SUBJECT_TEACHER" as const], teacherId: user.teacher!.id, studentId: null };
  const lesson = await prisma.libraryLesson.findFirstOrThrow({ where: { teacherId: teacher.teacherId, title: "Chuyển động thẳng đều", archivedAt: null } });
  let ex = await prisma.libraryExercise.findFirst({ where: { lessonId: lesson.id, title: TITLE, archivedAt: null } });
  if (!ex) {
    ex = await createExercise(teacher, lesson.id, { title: TITLE, kind: "NORMAL", quizMode: true, instructions: "Bài kiểm tra thử chế độ thi nghiêm túc: làm bài toàn màn hình, không chuyển tab hoặc ứng dụng khác.", attachments: [], showAnswers: "AFTER_SUBMIT", secureMode: true, maxViolations: 3, sourceLessonIds: [] });
    const ids = (await prisma.question.findMany({ where: { libraryLessonId: lesson.id, reviewStatus: "READY", archivedAt: null }, orderBy: { createdAt: "asc" } })).map((q) => q.id);
    await addQuestions(teacher, ex.id, ids, 2);
    console.log(`Đã tạo bài tập mẫu "${TITLE}" với ${ids.length} câu.`);
  }
  const a = await prisma.classSubjectAssignment.findFirstOrThrow({ where: { teacherId: teacher.teacherId, subject: { subjectName: "Vật lý" }, schoolClass: { className: "10A1" }, academicTerm: { termName: "HK1" } } });
  const r = await publishLesson(teacher, lesson.id, { assignmentIds: [a.id], items: [{ exerciseId: ex.id, dueDate: new Date("2027-12-31T00:00:00Z") }] });
  console.log("Đăng cho 10A1 (HK1):", r);
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error("LỖI:", e); await prisma.$disconnect(); process.exit(1); });
