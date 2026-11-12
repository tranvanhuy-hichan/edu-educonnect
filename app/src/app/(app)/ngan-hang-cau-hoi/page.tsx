import Link from "next/link";
import { PageCrumbs } from "@/components/page-crumbs";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { AutoForm } from "@/components/auto-form";
import { MathText } from "@/components/math-text";
import { MobileCollapse } from "@/components/mobile-collapse";
import { Pagination } from "@/components/pagination";
import { inputCls, Table, Title } from "@/components/ui";
import { SubjectGradeGrid } from "@/components/drill-cards";
import { getPaging } from "@/lib/paging";
import { DIFFICULTY_LABEL, TYPE_LABEL } from "@/modules/question/question.grading";
import { bankOverview, listQuestions } from "@/modules/question/question.service";
import { ImportDialog } from "@/components/import-dialog";
import { uploadLimit } from "@/lib/storage/config";
import { approveQuestion, deleteQuestion } from "./actions";

type SP = { subjectId?: string; gradeLevelId?: string; teacherId?: string; lessonId?: string; q?: string; difficulty?: string; type?: string; status?: string; page?: string; size?: string };
const href = (p: Record<string, string | undefined>) => `/ngan-hang-cau-hoi?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`;
const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

export default async function QuestionBank({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const sp = await searchParams;
  const pg = getPaging(sp);
  const own = !!me.teacherId;
  const [subjects, grades] = await Promise.all([
    own ? db.teacherSubject.findMany({ where: { teacherId: me.teacherId! }, include: { subject: true }, orderBy: { subject: { subjectName: "asc" } } }).then((r) => r.map((x) => x.subject)) : db.subject.findMany({ orderBy: { subjectName: "asc" } }),
    db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const overview = own ? await bankOverview(me) : null;
  const countOf = (subjectId?: string, gradeId?: string | null) => (overview?.counts ?? []).filter((c) => (!subjectId || c.subjectId === subjectId) && (gradeId === undefined || c.gradeLevelId === gradeId)).reduce((t, c) => t + c._count._all, 0);

  // Giáo viên: chọn môn -> chọn khối -> danh sách. Một môn duy nhất thì vào thẳng.
  const subjectId = sp.subjectId && subjects.some((s) => s.id === sp.subjectId) ? sp.subjectId : undefined;
  const gradeLevelId = sp.gradeLevelId && (sp.gradeLevelId === "none" || grades.some((g) => g.id === sp.gradeLevelId)) ? sp.gradeLevelId : undefined;
  const subject = subjects.find((s) => s.id === subjectId);
  const grade = grades.find((g) => g.id === gradeLevelId);

  const importLessons = own && subjectId && grade ? await db.libraryLesson.findMany({ where: { teacherId: me.teacherId!, subjectId, gradeLevelId: grade.id, archivedAt: null }, orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, orderNo: true } }) : [];
  const addBtn = own && subject && grade ? (
    <div className="flex flex-wrap items-center gap-2">
      <ImportDialog subjectId={subject.id} gradeLevelId={grade.id} lessons={importLessons} defaultLessonId={sp.lessonId && sp.lessonId !== "none" ? sp.lessonId : undefined} maxBytes={uploadLimit()} />
      {overview && overview.review > 0 && <Link href="/ngan-hang-cau-hoi/nhap" className={`${pill} h-9 bg-yellow-100 px-3 text-yellow-800`}><Sparkles className="mr-1 size-3.5" />{overview.review} câu AI chờ kiểm tra</Link>}
      <Link href="/ngan-hang-cau-hoi/nhap" className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-sm font-medium hover:bg-slate-50">Phiên nhập AI</Link>
      <Link href={`/ngan-hang-cau-hoi/moi?${new URLSearchParams({ subjectId: subject.id, gradeLevelId: grade.id, ...(sp.lessonId && sp.lessonId !== "none" ? { lessonId: sp.lessonId } : {}), back: href({ subjectId, gradeLevelId, lessonId: sp.lessonId }) })}`} className="inline-flex h-9 items-center rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700">+ Thêm câu hỏi</Link>
    </div>
  ) : undefined;

  const crumbs = (
    <PageCrumbs items={[{ label: "Ngân hàng câu hỏi", href: "/ngan-hang-cau-hoi" }, ...(subject && own ? [{ label: subject.subjectName, href: grade || gradeLevelId === "none" ? href({ subjectId }) : undefined }] : []), ...(own && grade ? [{ label: grade.gradeName }] : []), ...(own && gradeLevelId === "none" ? [{ label: "Chưa phân khối" }] : [])]} />
  );

  // ----- Chọn môn + khối ngay trên thẻ môn -----
  if (own && (!subjectId || !gradeLevelId)) {
    const shown = subject ? [subject] : subjects;
    return (
      <div className="space-y-4">
        {subject && crumbs}
        <Title right={subject ? <Link href="/ngan-hang-cau-hoi" className="text-sm text-orange-700 hover:underline">Xem tất cả môn</Link> : undefined}>Ngân hàng câu hỏi</Title>
        <SubjectGradeGrid
          emptyText="Bạn chưa được phân công phụ trách môn nào nên chưa soạn được câu hỏi. Hãy nhờ quản trị viên gán môn cho tài khoản của bạn."
          items={shown.map((s) => {
            const none = countOf(s.id, null);
            return {
              id: s.id, name: s.subjectName, summary: `${countOf(s.id)} câu hỏi`,
              grades: [
                ...grades.map((g) => ({ href: href({ subjectId: s.id, gradeLevelId: g.id }), label: g.gradeName, count: countOf(s.id, g.id), unit: "câu hỏi" })),
                ...(none > 0 ? [{ href: href({ subjectId: s.id, gradeLevelId: "none" }), label: "Chưa phân khối", count: none, unit: "câu cần gán khối" }] : []),
              ],
            };
          })}
        />
      </div>
    );
  }

  // ----- Bước 3: danh sách -----
  const lessons = own && subjectId && grade ? await db.libraryLesson.findMany({ where: { teacherId: me.teacherId!, subjectId, gradeLevelId: grade.id, archivedAt: null }, orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, orderNo: true } }) : [];
  const teachers = own ? [] : await db.teacher.findMany({ where: { questions: { some: { archivedAt: null } } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } });
  const filter = { subjectId, gradeLevelId, teacherId: own ? undefined : sp.teacherId, lessonId: sp.lessonId, q: sp.q, difficulty: sp.difficulty, type: sp.type, reviewStatus: sp.status === "review" ? "NEEDS_REVIEW" : undefined };
  const [questions, total] = await listQuestions(me, filter, pg.skip, pg.take);
  const active = [sp.lessonId, sp.difficulty, sp.type, sp.status, !own && sp.subjectId, !own && sp.gradeLevelId, !own && sp.teacherId].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {own && crumbs}
      <Title right={addBtn}>{own ? `${subject!.subjectName} · ${grade?.gradeName ?? "Chưa phân khối"} (${total})` : `Ngân hàng câu hỏi (${total})`}</Title>

      <AutoForm className="flex flex-wrap items-center gap-2">
        {own && <><input type="hidden" name="subjectId" value={subjectId} /><input type="hidden" name="gradeLevelId" value={gradeLevelId} /></>}
        <input name="q" defaultValue={sp.q} placeholder="Tìm theo nội dung, chương/bài..." className={inputCls + " min-w-0 flex-1 md:min-w-56"} />
        <MobileCollapse active={active}>
          {!own && <select name="subjectId" defaultValue={sp.subjectId ?? ""} className={inputCls} aria-label="Môn"><option value="">Tất cả môn</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.subjectName}</option>)}</select>}
          {!own && <select name="teacherId" defaultValue={sp.teacherId ?? ""} className={inputCls} aria-label="Giáo viên"><option value="">Tất cả giáo viên</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select>}
          {!own && <select name="gradeLevelId" defaultValue={sp.gradeLevelId ?? ""} className={inputCls} aria-label="Khối"><option value="">Tất cả khối</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.gradeName}</option>)}</select>}
          {own && <select name="lessonId" defaultValue={sp.lessonId ?? ""} className={inputCls} aria-label="Bài học"><option value="">Tất cả bài học</option><option value="none">Chưa phân bài</option>{lessons.map((l) => <option key={l.id} value={l.id}>Bài {l.orderNo}. {l.title}</option>)}</select>}
          <select name="type" defaultValue={sp.type ?? ""} className={inputCls} aria-label="Loại câu"><option value="">Mọi loại câu</option>{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="difficulty" defaultValue={sp.difficulty ?? ""} className={inputCls} aria-label="Độ khó"><option value="">Mọi độ khó</option>{Object.entries(DIFFICULTY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="status" defaultValue={sp.status ?? ""} className={inputCls} aria-label="Trạng thái"><option value="">Mọi trạng thái</option><option value="review">Chờ kiểm tra</option></select>
        </MobileCollapse>
      </AutoForm>

      <Table mobileLayout="compact" head={own ? ["Câu hỏi", "Bài học", "Loại", "Độ khó", "Đã dùng", ""] : ["Câu hỏi", "Môn · khối", "Loại", "Giáo viên", "Đã dùng"]}>
        {questions.map((q) => {
          const flagged = q.reviewStatus === "NEEDS_REVIEW";
          return (
            <tr key={q.id} className="align-middle [&>td]:!py-3">
              <td className="min-w-56 max-w-md">
                {own ? <Link data-row href={`/ngan-hang-cau-hoi/${q.id}?${new URLSearchParams({ back: href({ subjectId, gradeLevelId, lessonId: sp.lessonId }) })}`} className="line-clamp-2 font-medium hover:text-orange-700"><MathText text={q.content || "(Câu hỏi chỉ có ảnh)"} /></Link> : <div className="line-clamp-2 font-medium"><MathText text={q.content || "(Câu hỏi chỉ có ảnh)"} /></div>}
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">{q.topic}{flagged && <span className={`${pill} bg-yellow-100 text-yellow-800`} title={q.reviewNote ?? undefined}>Chờ kiểm tra</span>}</div>
              </td>
              {own ? <td className="text-sm">{q.libraryLesson ? q.libraryLesson.title : <span className="text-slate-400">Chưa phân bài</span>}</td> : <td className="text-sm">{q.subject.subjectName}{q.gradeLevel ? ` · ${q.gradeLevel.gradeName}` : ""}</td>}
              <td><span className={`${pill} bg-slate-100 text-slate-700`}>{TYPE_LABEL[q.type] ?? q.type}</span></td>
              {own ? <td><span className={`${pill} ${q.difficulty === "EASY" ? "bg-green-100 text-green-800" : q.difficulty === "HARD" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-800"}`}>{DIFFICULTY_LABEL[q.difficulty]}</span></td> : <td className="text-sm">{q.teacher.fullName}</td>}
              <td>{q._count.exercises} bài tập</td>
              {own && <td className="whitespace-nowrap">
                <div className="flex items-center gap-2">
                  {flagged && <ActionForm action={approveQuestion} submit="Duyệt" compact className="inline-flex"><input type="hidden" name="id" value={q.id} /></ActionForm>}
                  <Link href={`/ngan-hang-cau-hoi/${q.id}?${new URLSearchParams({ back: href({ subjectId, gradeLevelId, lessonId: sp.lessonId }) })}`} className="inline-flex h-8 items-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-slate-50">Sửa</Link>
                  <ActionForm action={deleteQuestion} submit="Xóa" compact danger confirmText="Xóa câu hỏi này khỏi ngân hàng? Các bài tập đã dùng câu hỏi vẫn giữ nguyên." className="inline-flex"><input type="hidden" name="id" value={q.id} /></ActionForm>
                </div>
              </td>}
            </tr>
          );
        })}
        {!questions.length && <tr><td colSpan={own ? 6 : 5} className="py-8 text-center text-slate-500">{own ? 'Chưa có câu hỏi nào ở đây. Bấm "+ Thêm câu hỏi" để soạn.' : "Chưa có câu hỏi nào."}</td></tr>}
      </Table>
      <Pagination total={total} page={pg.page} size={pg.size} path="/ngan-hang-cau-hoi" params={{ subjectId, gradeLevelId, teacherId: sp.teacherId, lessonId: sp.lessonId, q: sp.q, difficulty: sp.difficulty, type: sp.type, status: sp.status, size: sp.size }} />
    </div>
  );
}
