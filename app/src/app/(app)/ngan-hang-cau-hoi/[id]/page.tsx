import { PageCrumbs } from "@/components/page-crumbs";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { Card, Title } from "@/components/ui";
import { QuestionEditor, type LessonOption, type QuestionDraft } from "@/components/question-editor";
import { uploadLimit } from "@/lib/storage/config";
import { attachmentNames } from "@/modules/files/files.service";
import { readAnswerKey } from "@/modules/question/question.grading";
import { getQuestion } from "@/modules/question/question.service";
import { saveQuestion } from "../actions";

const urlsOf = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const safeBack = (v?: string) => (v && v.startsWith("/") && !v.startsWith("//") ? v : undefined);

export default async function QuestionEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ subjectId?: string; gradeLevelId?: string; lessonId?: string; back?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  if (!me.teacherId) redirect("/ngan-hang-cau-hoi");
  const { id } = await params;
  const sp = await searchParams;
  const [taught, grades, lessonRows] = await Promise.all([
    db.teacherSubject.findMany({ where: { teacherId: me.teacherId }, include: { subject: true }, orderBy: { subject: { subjectName: "asc" } } }),
    db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    db.libraryLesson.findMany({ where: { teacherId: me.teacherId, archivedAt: null }, orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, orderNo: true, subjectId: true, gradeLevelId: true } }),
  ]);
  const subjects = taught.map((t) => ({ id: t.subjectId, name: t.subject.subjectName }));
  const lessons: LessonOption[] = lessonRows;

  let initial: QuestionDraft;
  let note: string | null = null;
  const back = safeBack(sp.back);
  if (id === "moi") {
    if (!subjects.length) redirect("/ngan-hang-cau-hoi");
    const lesson = lessons.find((l) => l.id === sp.lessonId);
    initial = {
      type: "SINGLE_CHOICE", subjectId: lesson?.subjectId ?? (subjects.some((s) => s.id === sp.subjectId) ? sp.subjectId! : subjects[0].id),
      gradeLevelId: lesson?.gradeLevelId ?? (grades.some((g) => g.id === sp.gradeLevelId) ? sp.gradeLevelId! : ""), libraryLessonId: lesson?.id ?? "",
      topic: "", difficulty: "MEDIUM", content: "", explanation: "", images: [],
      options: Array.from({ length: 4 }, (_, i) => ({ uid: `init${i}`, content: "", isCorrect: false, images: [] })),
      mode: "NUMBER", answers: "", tolerance: "",
    };
  } else {
    const q = await getQuestion(me, id);
    if (!q || q.archivedAt || q.teacherId !== me.teacherId) notFound();
    const key = readAnswerKey(q.answerKey);
    if (q.reviewStatus === "NEEDS_REVIEW") note = q.reviewNote ?? "Câu hỏi do AI trích xuất, cần kiểm tra lại.";
    initial = {
      id: q.id, type: q.type, subjectId: q.subjectId, gradeLevelId: q.gradeLevelId ?? "", libraryLessonId: q.libraryLessonId ?? "", topic: q.topic ?? "", difficulty: q.difficulty, content: q.content, explanation: q.explanation ?? "",
      images: await attachmentNames(urlsOf(q.images)),
      options: await Promise.all(q.options.map(async (o) => ({ uid: o.id, content: o.content, isCorrect: o.isCorrect, images: await attachmentNames(urlsOf(o.images)) }))),
      mode: key.mode, answers: key.answers.join("\n"), tolerance: key.tolerance ? String(key.tolerance).replace(".", ",") : "",
    };
  }
  const used = id === "moi" ? 0 : (await getQuestion(me, id))?._count.exercises ?? 0;
  const bankHref = `/ngan-hang-cau-hoi?${new URLSearchParams({ ...(initial.subjectId ? { subjectId: initial.subjectId } : {}), ...(initial.gradeLevelId ? { gradeLevelId: initial.gradeLevelId } : {}) })}`;

  return (
    <div className="space-y-4">
      <PageCrumbs items={[{ label: "Ngân hàng câu hỏi", href: "/ngan-hang-cau-hoi" }, ...(subjects.find((s) => s.id === initial.subjectId) ? [{ label: subjects.find((s) => s.id === initial.subjectId)!.name, href: `/ngan-hang-cau-hoi?subjectId=${initial.subjectId}` }] : []), ...(grades.find((g) => g.id === initial.gradeLevelId) ? [{ label: grades.find((g) => g.id === initial.gradeLevelId)!.gradeName, href: bankHref }] : []), { label: id === "moi" ? "Thêm câu hỏi" : "Sửa câu hỏi" }]} />
      <Title>{id === "moi" ? "Thêm câu hỏi" : "Sửa câu hỏi"}</Title>
      {note && <Card className="border-yellow-300 bg-yellow-50 text-sm text-yellow-900"><b>Cần kiểm tra:</b> {note} Khi bạn bấm &quot;Lưu câu hỏi&quot;, câu hỏi được xem là đã kiểm tra và dùng được trong bài tập.</Card>}
      {used > 0 && <Card className="text-sm text-slate-600">Câu hỏi này đang dùng trong {used} bài tập. Nếu đã có học sinh làm bài, khi lưu hệ thống tạo một phiên bản mới của câu hỏi và giữ nguyên bản cũ để điểm đã chấm không bị thay đổi.</Card>}
      <Card><QuestionEditor action={saveQuestion} initial={initial} subjects={subjects} grades={grades.map((g) => ({ id: g.id, name: g.gradeName }))} lessons={lessons} maxBytes={uploadLimit()} cancelHref={back ?? bankHref} returnTo={back} /></Card>
    </div>
  );
}
