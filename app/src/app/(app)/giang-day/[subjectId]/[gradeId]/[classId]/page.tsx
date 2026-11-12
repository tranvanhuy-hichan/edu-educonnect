import Link from "next/link";
import { PageCrumbs } from "@/components/page-crumbs";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { db } from "@/lib/db";
import { AttachmentUpload } from "@/components/attachment-upload";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls, Table, Title } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { MobileCards } from "@/components/mobile-cards";
import { isManager } from "@/server/learning-scope";
import { loadGrade, loadSubject, teachingScope, requireTeachingViewer } from "@/server/teaching-scope";
import { PublishFromLibrary } from "@/components/publish-from-library";
import { createPost } from "../../../../bai-hoc/actions";

export default async function TeachingClass({ params }: { params: Promise<{ subjectId: string; gradeId: string; classId: string }> }) {
  const me = await requireTeachingViewer();
  const { subjectId, gradeId, classId } = await params;
  const [subject, grade] = await Promise.all([loadSubject(me, subjectId), loadGrade(gradeId)]);
  const assignments = await db.classSubjectAssignment.findMany({
    where: { AND: [teachingScope(me), { subjectId, schoolClassId: classId, schoolClass: { gradeLevelId: gradeId } }] },
    include: { schoolClass: { include: { _count: { select: { enrollments: true } } } }, teacher: { select: { fullName: true } }, academicTerm: { include: { academicYear: true } } },
    orderBy: { academicTerm: { startDate: "desc" } },
  });
  if (!assignments.length) notFound();
  const cls = assignments[0].schoolClass;
  const ids = assignments.map((a) => a.id);
  const [posts, views, library, published] = await Promise.all([
    db.lessonPost.findMany({ where: { assignmentId: { in: ids } }, orderBy: { createdAt: "desc" }, include: { _count: { select: { exercises: true } } } }),
    db.lessonPostView.groupBy({ by: ["lessonPostId"], where: { lessonPost: { assignmentId: { in: ids } } }, _count: { _all: true } }),
    // Bài học trong kho của giáo viên (cùng môn, cùng khối) để đăng cho lớp này
    me.teacherId ? db.libraryLesson.findMany({ where: { teacherId: me.teacherId, subjectId, gradeLevelId: gradeId, archivedAt: null }, orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }], include: { exercises: { where: { archivedAt: null }, orderBy: { orderNo: "asc" }, include: { _count: { select: { questions: true } } } } } }) : Promise.resolve([]),
    db.lessonPost.findMany({ where: { assignmentId: { in: ids }, sourceLessonId: { not: null } }, select: { assignmentId: true, sourceLessonId: true } }),
  ]);
  const viewsOf = new Map(views.map((v) => [v.lessonPostId, v._count._all]));
  const roster = cls._count.enrollments;
  const termLabel = (a: (typeof assignments)[number]) => `${a.academicTerm.termName} · ${a.academicTerm.academicYear.yearName}`;
  const base = `/giang-day/${subjectId}/${gradeId}`;
  const manageable = assignments; // phạm vi đã giới hạn theo quyền (giáo viên: lớp mình dạy; quản lý: tất cả)

  const assignmentSelect = (name: string) => manageable.length > 1
    ? <Field label="Học kỳ"><select name={name} className={inputCls + " w-full"} required>{manageable.map((a) => <option key={a.id} value={a.id}>{termLabel(a)}</option>)}</select></Field>
    : <input type="hidden" name={name} value={manageable[0].id} />;

  return (
    <div className="space-y-4">
      <PageCrumbs items={[{ label: "Giảng dạy", href: "/giang-day" }, { label: subject.subjectName, href: `/giang-day?mon=${subjectId}` }, { label: grade.gradeName, href: base }, { label: cls.className }]} />
      <Title right={
        <div className="flex flex-wrap items-center gap-2">
          {me.teacherId && <PublishFromLibrary className={cls.className} subjectName={subject.subjectName} gradeName={grade.gradeName} assignments={manageable.map((a) => ({ id: a.id, label: termLabel(a) }))} library={library} publishedLessonIds={published.map((p) => p.sourceLessonId!).filter(Boolean)} />}
          <DialogButton label="+ Đăng bài học mới" title={`Đăng bài học · ${cls.className}`} wide>
            <ActionForm action={createPost} submit="Đăng bài học" className="flex flex-col gap-3 [&>button]:self-start">
              {assignmentSelect("assignmentId")}
              <Field label="Tiêu đề"><input name="title" className={inputCls + " w-full"} required /></Field>
              <Field label="Nội dung"><textarea name="content" rows={5} className={inputCls + " h-auto w-full py-2"} /></Field>
              <div className="space-y-1 text-xs font-semibold"><p>Tệp đính kèm</p><AttachmentUpload purpose="LESSON_POST" assignmentId={manageable[0].id} /></div>
            </ActionForm>
          </DialogButton>
        </div>}>{subject.subjectName} · {cls.className}</Title>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600"><span>{grade.gradeName}</span><span>{roster} học sinh</span><span>{posts.length} bài học đã đăng</span>{isManager(me) && <span>GV: {[...new Set(assignments.map((a) => a.teacher.fullName))].join(", ")}</span>}</div>

      {assignments.map((a) => {
        const list = posts.filter((p) => p.assignmentId === a.id);
        return (
          <section key={a.id} className="space-y-2">
            {assignments.length > 1 && <h2 className="text-sm font-semibold text-slate-700">{termLabel(a)}</h2>}
            <MobileCards
              empty={`Chưa có bài học nào đăng cho lớp này${assignments.length > 1 ? " ở học kỳ này" : ""}.`}
              items={list.map((p) => ({ key: p.id, href: `/bai-hoc/${p.id}`, title: p.title, chips: [`${p._count.exercises} bài tập`, `Đã xem ${viewsOf.get(p.id) ?? 0}/${roster}`, fmtDate(p.createdAt)] }))}
            />
            <div className="hidden md:block">
            <Table head={["Bài học", "Bài tập", "Đã xem", "Ngày đăng"]}>
              {list.map((p) => (
                <tr key={p.id} className="align-middle [&>td]:!py-3">
                  <td className="min-w-48"><Link data-row href={`/bai-hoc/${p.id}`} className="font-semibold text-orange-700 hover:underline">{p.title}</Link></td>
                  <td>{p._count.exercises}</td>
                  <td><span className="inline-flex items-center gap-1"><Eye className="size-4 text-slate-400" />{viewsOf.get(p.id) ?? 0}/{roster}</span></td>
                  <td>{fmtDate(p.createdAt)}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Chưa có bài học nào đăng cho lớp này{assignments.length > 1 ? " ở học kỳ này" : ""}.</td></tr>}
            </Table>
            </div>
          </section>
        );
      })}
      {!assignments.length && <Card>Không có dữ liệu.</Card>}
    </div>
  );
}
