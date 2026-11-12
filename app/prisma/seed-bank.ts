/**
 * Dữ liệu demo cho Ngân hàng bài học / Ngân hàng câu hỏi / bài ôn tập / đăng cho lớp.
 * Dùng chính các service của ứng dụng. Giáo viên: giaovien@sonha.edu.vn (Vật lý, Khối 10); học sinh: hocsinh1@sonha.edu.vn (lớp 10A1).
 * Chạy lại nhiều lần không tạo trùng (bỏ qua nếu bài học cùng tên đã có).
 */
import { PrismaClient } from "@prisma/client";
import { createLesson, createExercise, addQuestions, autoPick, publishLesson } from "../src/modules/bank/bank.service";
import { createQuestion } from "../src/modules/question/question.service";

const prisma = new PrismaClient();
type Opt = [string, boolean];
const sc = (content: string, difficulty: string, opts: Opt[], topic?: string, explanation?: string) => ({ type: "SINGLE_CHOICE", content, difficulty, topic, explanation, options: opts.map(([c, ok]) => ({ content: c, isCorrect: ok, images: [] as string[] })), answerKey: null });
const num = (content: string, difficulty: string, answer: string, tol = 0, explanation?: string) => ({ type: "SHORT_ANSWER", content, difficulty, explanation, options: [], answerKey: { mode: "NUMBER", answers: [answer], tolerance: tol } });
const tf = (content: string, difficulty: string, items: [string, boolean][]) => ({ type: "TRUE_FALSE_GROUP", content, difficulty, options: items.map(([c, ok]) => ({ content: c, isCorrect: ok, images: [] as string[] })), answerKey: null });

const LESSONS = [
  { title: "Chuyển động thẳng đều", content: "Chuyển động thẳng đều là chuyển động có quỹ đạo thẳng và vận tốc không đổi: $s = v t$, $x = x_0 + v t$.", questions: [
    sc("Một vật chuyển động thẳng đều với $v = 5\\,\\text{m/s}$. Quãng đường vật đi được sau $t = 4\\,\\text{s}$ là:", "EASY", [["$10\\,\\text{m}$", false], ["$20\\,\\text{m}$", true], ["$\\frac{5}{4}\\,\\text{m}$", false], ["$40\\,\\text{m}$", false]], "Công thức quãng đường", "$s = vt = 5 \\cdot 4 = 20\\,\\text{m}$"),
    sc("Chuyển động thẳng đều có đặc điểm nào sau đây?", "EASY", [["Vận tốc thay đổi đều theo thời gian", false], ["Quỹ đạo thẳng, vận tốc không đổi", true], ["Gia tốc không đổi và khác 0", false], ["Quỹ đạo tròn, tốc độ không đổi", false]]),
    sc("Phương trình chuyển động của một chất điểm là $x = 5 + 3t$ ($x$ đo bằng m, $t$ đo bằng s). Vận tốc của chất điểm là:", "MEDIUM", [["$5\\,\\text{m/s}$", false], ["$3\\,\\text{m/s}$", true], ["$8\\,\\text{m/s}$", false], ["$15\\,\\text{m/s}$", false]], "Phương trình chuyển động"),
    num("Một xe đi được $120\\,\\text{km}$ trong $2\\,\\text{h}$. Tốc độ trung bình của xe là bao nhiêu km/h?", "MEDIUM", "60", 0, "$v = \\frac{s}{t} = \\frac{120}{2} = 60\\,\\text{km/h}$"),
    tf("Hai xe A và B xuất phát cùng lúc từ hai địa điểm cách nhau $100\\,\\text{km}$, chạy ngược chiều nhau trên đường thẳng với $v_A = 40\\,\\text{km/h}$, $v_B = 60\\,\\text{km/h}$. Xét tính đúng sai của các phát biểu:", "HARD", [
      ["Tổng tốc độ của hai xe là $100\\,\\text{km/h}$.", true], ["Hai xe gặp nhau sau $2\\,\\text{h}$.", false], ["Khi gặp nhau, xe A đã đi được $40\\,\\text{km}$.", true], ["Xe B đi nhanh hơn nên đến vị trí gặp nhau sau xe A.", false]]),
  ] },
  { title: "Chuyển động thẳng biến đổi đều", content: "Gia tốc không đổi: $v = v_0 + at$, $s = v_0 t + \\frac{1}{2} a t^2$, $v^2 - v_0^2 = 2as$.", questions: [
    sc("Một vật bắt đầu chuyển động nhanh dần đều từ nghỉ với $a = 2\\,\\text{m/s}^2$. Vận tốc sau $t = 5\\,\\text{s}$ là:", "EASY", [["$5\\,\\text{m/s}$", false], ["$7\\,\\text{m/s}$", false], ["$10\\,\\text{m/s}$", true], ["$25\\,\\text{m/s}$", false]], "Công thức vận tốc", "$v = at = 2 \\cdot 5 = 10\\,\\text{m/s}$"),
    sc("Trong chuyển động thẳng nhanh dần đều, đại lượng nào sau đây không đổi?", "EASY", [["Vận tốc", false], ["Quãng đường", false], ["Gia tốc", true], ["Tọa độ", false]]),
    sc("Xe tăng tốc từ $v_0 = 10\\,\\text{m/s}$ lên $v = 20\\,\\text{m/s}$ trong quãng đường $s = 75\\,\\text{m}$. Gia tốc của xe là:", "MEDIUM", [["$1\\,\\text{m/s}^2$", false], ["$2\\,\\text{m/s}^2$", true], ["$3\\,\\text{m/s}^2$", false], ["$4\\,\\text{m/s}^2$", false]], "Công thức độc lập thời gian", "$a = \\frac{v^2 - v_0^2}{2s} = \\frac{400 - 100}{150} = 2\\,\\text{m/s}^2$"),
    num("Vật chuyển động nhanh dần đều không vận tốc đầu với $a = 4\\,\\text{m/s}^2$. Quãng đường đi được trong $3\\,\\text{s}$ đầu là bao nhiêu mét?", "MEDIUM", "18", 0, "$s = \\frac{1}{2} a t^2 = \\frac{1}{2} \\cdot 4 \\cdot 9 = 18\\,\\text{m}$"),
    tf("Một ô tô đang chạy với $v_0 = 20\\,\\text{m/s}$ thì hãm phanh, chuyển động chậm dần đều với $a = -4\\,\\text{m/s}^2$. Xét tính đúng sai:", "HARD", [
      ["Ô tô dừng lại sau $5\\,\\text{s}$.", true], ["Quãng đường đi được đến khi dừng là $40\\,\\text{m}$.", false], ["Vận tốc sau $2\\,\\text{s}$ là $12\\,\\text{m/s}$.", true], ["Gia tốc của xe làm vận tốc tăng đều.", false]]),
  ] },
  { title: "Rơi tự do", content: "Rơi tự do là chuyển động chỉ chịu tác dụng của trọng lực, gia tốc $g \\approx 10\\,\\text{m/s}^2$: $v = gt$, $h = \\frac{1}{2} g t^2$.", questions: [
    sc("Sự rơi tự do là chuyển động:", "EASY", [["Thẳng đều", false], ["Thẳng nhanh dần đều chỉ dưới tác dụng của trọng lực", true], ["Tròn đều", false], ["Chậm dần đều", false]]),
    num("Một vật rơi tự do từ độ cao $h = 20\\,\\text{m}$, lấy $g = 10\\,\\text{m/s}^2$. Thời gian rơi là bao nhiêu giây?", "MEDIUM", "2", 0.05, "$t = \\sqrt{\\frac{2h}{g}} = \\sqrt{\\frac{2 \\cdot 20}{10}} = 2\\,\\text{s}$"),
    sc("Vật rơi tự do từ độ cao $h = 45\\,\\text{m}$ ($g = 10\\,\\text{m/s}^2$). Vận tốc khi chạm đất là:", "HARD", [["$20\\,\\text{m/s}$", false], ["$30\\,\\text{m/s}$", true], ["$45\\,\\text{m/s}$", false], ["$90\\,\\text{m/s}$", false]], "Vận tốc chạm đất", "$v = \\sqrt{2gh} = \\sqrt{900} = 30\\,\\text{m/s}$"),
    tf("Hai vật có khối lượng khác nhau được thả rơi tự do cùng lúc từ cùng một độ cao trong chân không. Xét tính đúng sai:", "MEDIUM", [
      ["Hai vật chạm đất cùng lúc.", true], ["Vật nặng hơn rơi nhanh hơn.", false], ["Gia tốc của hai vật bằng nhau.", true], ["Vận tốc chạm đất của vật nặng lớn hơn.", false]]),
  ] },
];

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "giaovien@sonha.edu.vn" }, include: { teacher: true } });
  const teacher = { userId: user.id, email: user.email, roles: ["SUBJECT_TEACHER" as const], teacherId: user.teacher!.id, studentId: null };
  const subject = await prisma.subject.findUniqueOrThrow({ where: { subjectName: "Vật lý" } });
  const grade = await prisma.gradeLevel.findFirstOrThrow({ where: { gradeName: "Khối 10" } });
  const exists = await prisma.libraryLesson.findFirst({ where: { teacherId: teacher.teacherId, subjectId: subject.id, gradeLevelId: grade.id, title: LESSONS[0].title, archivedAt: null } });
  if (exists) { console.log("Dữ liệu demo đã có, bỏ qua."); return; }

  const lessonIds: string[] = [];
  for (const [i, def] of LESSONS.entries()) {
    const lesson = await createLesson(teacher, { subjectId: subject.id, gradeLevelId: grade.id, title: def.title, content: def.content, attachments: [], orderNo: i + 1 });
    lessonIds.push(lesson.id);
    for (const q of def.questions) await createQuestion(teacher, { ...q, subjectId: subject.id, gradeLevelId: grade.id, libraryLessonId: lesson.id, images: [], topic: (q as { topic?: string }).topic ?? null, explanation: (q as { explanation?: string }).explanation ?? null });
  }
  // một câu AI chưa duyệt để thử luồng "Chờ kiểm tra"
  const flagged = await createQuestion(teacher, { ...sc("Câu mẫu do AI trích xuất: đơn vị của vận tốc trong hệ SI là gì?", "EASY", [["m/s", true], ["km/h", false]]), subjectId: subject.id, gradeLevelId: grade.id, libraryLessonId: lessonIds[0], images: [], topic: null, explanation: null });
  await prisma.question.update({ where: { id: flagged.id }, data: { reviewStatus: "NEEDS_REVIEW", reviewNote: "AI tự giải, đề không có đáp án. Hãy kiểm tra lại đáp án đúng." } });

  const ex1 = await createExercise(teacher, lessonIds[0], { title: "Kiểm tra 15 phút - Chuyển động thẳng đều", kind: "NORMAL", quizMode: true, instructions: "Làm bài trong 15 phút. Mỗi câu đúng được điểm theo thang đã nêu.", attachments: [], showAnswers: "AFTER_SUBMIT", sourceLessonIds: [] });
  const ids1 = (await prisma.question.findMany({ where: { libraryLessonId: lessonIds[0], reviewStatus: "READY" }, orderBy: { createdAt: "asc" } })).map((q) => q.id);
  await addQuestions(teacher, ex1.id, ids1, 1);
  const ex2 = await createExercise(teacher, lessonIds[1], { title: "Bài tập - Chuyển động thẳng biến đổi đều", kind: "NORMAL", quizMode: true, instructions: "", attachments: [], showAnswers: "AFTER_DUE", sourceLessonIds: [] });
  await addQuestions(teacher, ex2.id, (await prisma.question.findMany({ where: { libraryLessonId: lessonIds[1] }, orderBy: { createdAt: "asc" } })).map((q) => q.id), 1);
  const review = await createExercise(teacher, lessonIds[2], { title: "Ôn tập giữa kỳ 1 (Bài 1 - 2)", kind: "REVIEW", quizMode: true, instructions: "Ôn tập kiến thức Bài 1 và Bài 2.", attachments: [], showAnswers: "AFTER_SUBMIT", sourceLessonIds: [lessonIds[0], lessonIds[1]] });
  const picked = await autoPick(teacher, review.id, { perLesson: { [lessonIds[0]]: 3, [lessonIds[1]]: 3 }, difficulty: { EASY: 2, MEDIUM: 2, HARD: 1 } }, true, 1);
  console.log("Bài ôn tập:", picked);

  // đăng Bài 1 (kèm kiểm tra) và Bài 3 (kèm ôn tập) cho 10A1 - HK1; để Bài 2 chưa đăng để thử thao tác đăng
  const a = await prisma.classSubjectAssignment.findFirstOrThrow({ where: { teacherId: teacher.teacherId, subjectId: subject.id, schoolClass: { className: "10A1" }, academicTerm: { termName: "HK1" } } });
  const due = new Date("2026-12-31T00:00:00Z");
  console.log("Đăng Bài 1:", await publishLesson(teacher, lessonIds[0], { assignmentIds: [a.id], items: [{ exerciseId: ex1.id, dueDate: due }] }));
  console.log("Đăng Bài 3:", await publishLesson(teacher, lessonIds[2], { assignmentIds: [a.id], items: [{ exerciseId: review.id, dueDate: due }] }));
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error("LỖI:", e); await prisma.$disconnect(); process.exit(1); });
