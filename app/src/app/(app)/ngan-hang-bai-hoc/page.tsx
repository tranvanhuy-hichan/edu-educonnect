import Link from "next/link";
import { getGradeLevels, getSubjects } from "@/lib/catalog-cache";
import { PageCrumbs } from "@/components/page-crumbs";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { AttachmentUpload } from "@/components/attachment-upload";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { AutoForm } from "@/components/auto-form";
import { MobileCards } from "@/components/mobile-cards";
import { Field, inputCls, Table, Title } from "@/components/ui";
import { SubjectGradeGrid } from "@/components/drill-cards";
import * as bankRepo from "@/modules/bank/bank.repository";
import { createLessonAction } from "./actions";

type SP = { subjectId?: string; gradeLevelId?: string; teacherId?: string; q?: string };
const href = (p: SP) => `/ngan-hang-bai-hoc?${new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])}`;

export default async function LessonBank({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const own = !!me.teacherId; // giáo viên: kho riêng (sửa được); quản lý/quản trị: xem bài học của tất cả giáo viên (chỉ xem)
  const sp = await searchParams;
  const [taught, grades, counts] = await Promise.all([
    own ? db.teacherSubject.findMany({ where: { teacherId: me.teacherId! }, include: { subject: true }, orderBy: { subject: { subjectName: "asc" } } }).then((r) => r.map((x) => x.subject)) : getSubjects(),
    getGradeLevels(),
    bankRepo.lessonCountsByGrade(me.teacherId ?? undefined),
  ]);
  const countOf = (s?: string, g?: string) => counts.filter((c) => (!s || c.subjectId === s) && (!g || c.gradeLevelId === g)).reduce((t, c) => t + c._count._all, 0);
  const subjectId = sp.subjectId && taught.some((s) => s.id === sp.subjectId) ? sp.subjectId : undefined;
  const gradeId = sp.gradeLevelId && grades.some((g) => g.id === sp.gradeLevelId) ? sp.gradeLevelId : undefined;
  const subject = taught.find((s) => s.id === subjectId), grade = grades.find((g) => g.id === gradeId);

  const crumbs = (
    <PageCrumbs items={[{ label: "Bài học", href: "/ngan-hang-bai-hoc" }, ...(subject ? [{ label: subject.subjectName, href: grade ? href({ subjectId }) : undefined }] : []), ...(grade ? [{ label: grade.gradeName }] : [])]} />
  );

  // Chọn môn + khối ngay trên thẻ môn (không có trang chọn khối riêng)
  if (!subject || !grade) {
    const shown = subject ? [subject] : taught;
    return (
      <div className="space-y-4">
        {subject && crumbs}
        <Title right={subject ? <Link href="/ngan-hang-bai-hoc" className="text-sm text-orange-700 hover:underline">Xem tất cả môn</Link> : undefined}>Bài học</Title>
        <SubjectGradeGrid
          emptyText="Bạn chưa được phân công phụ trách môn nào. Hãy nhờ quản trị viên gán môn cho tài khoản của bạn."
          items={shown.map((s) => ({ id: s.id, name: s.subjectName, summary: `${countOf(s.id)} bài học`, grades: grades.map((g) => ({ href: href({ subjectId: s.id, gradeLevelId: g.id }), label: g.gradeName, count: countOf(s.id, g.id), unit: "bài học", disabled: !own && countOf(s.id, g.id) === 0 })) }))}
        />
      </div>
    );
  }

  const allLessons = await bankRepo.listLessons(me.teacherId ?? undefined, subject.id, grade.id);
  // quản lý: lọc theo giáo viên và tìm theo tên bài học
  const lessonTeachers = own ? [] : [...new Map(allLessons.map((l) => [l.teacherId, l.teacher.fullName])).entries()].sort((x, y) => x[1].localeCompare(y[1], "vi"));
  const needle = (sp.q ?? "").trim().toLowerCase();
  const lessons = own ? allLessons : allLessons.filter((l) => (!sp.teacherId || l.teacherId === sp.teacherId) && (!needle || l.title.toLowerCase().includes(needle)));
  const nextNo = (lessons.at(-1)?.orderNo ?? 0) + 1;
  return (
    <div className="space-y-4">
      {crumbs}
      <Title right={!own ? undefined : (
        <DialogButton label="+ Thêm bài học" title={`Thêm bài học · ${subject.subjectName} · ${grade.gradeName}`} wide>
          <ActionForm action={createLessonAction} submit="Tạo bài học" className="flex flex-col gap-3 [&>button]:self-start">
            <input type="hidden" name="subjectId" value={subject.id} /><input type="hidden" name="gradeLevelId" value={grade.id} />
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <Field label="Bài số"><input name="orderNo" defaultValue={nextNo} inputMode="numeric" className={inputCls + " w-full"} /></Field>
              <Field label="Tên bài học"><input name="title" className={inputCls + " w-full"} required /></Field>
            </div>
            <Field label="Nội dung"><textarea name="content" rows={5} className={inputCls + " h-auto w-full py-2"} /></Field>
            <div className="group/r space-y-3">
              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
                <input type="checkbox" name="review" value="1" className="mt-1" />
                <span><b>Đây là bài ôn tập</b><br /><span className="text-xs font-normal text-slate-500">Ôn lại các bài học trước: tự tạo bài tập ôn tập lấy câu hỏi từ các bài đã chọn</span></span>
              </label>
              <div className="hidden space-y-3 group-has-[input[name=review]:checked]/r:block">
                <div className="space-y-1 text-xs font-medium text-slate-600">
                  <p>Ôn tập các bài học</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                    {lessons.map((l) => <label key={l.id} className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="sourceLessonIds" value={l.id} defaultChecked />Bài {l.orderNo}. {l.title}</label>)}
                    {!lessons.length && <p className="text-sm font-normal text-slate-500">Chưa có bài học nào để ôn tập. Hãy tạo các bài học trước.</p>}
                  </div>
                </div>
                <Field label="Số câu bốc tự động (không bắt buộc, có thể chọn câu sau)"><input name="autoTotal" inputMode="numeric" placeholder="vd 10" className={inputCls + " w-full sm:w-40"} /></Field>
              </div>
            </div>
            <div className="space-y-1 text-xs font-semibold"><p>Tệp đính kèm</p><AttachmentUpload purpose="LIBRARY" /></div>
          </ActionForm>
        </DialogButton>)}>{subject.subjectName} · {grade.gradeName} ({lessons.length} bài)</Title>

      {!own && (
        <AutoForm className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="subjectId" value={subject.id} /><input type="hidden" name="gradeLevelId" value={grade.id} />
          <input name="q" defaultValue={sp.q} placeholder="Tìm tên bài học..." className={inputCls + " min-w-0 flex-1 md:min-w-56"} />
          <select name="teacherId" defaultValue={sp.teacherId ?? ""} className={inputCls} aria-label="Giáo viên"><option value="">Tất cả giáo viên</option>{lessonTeachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </AutoForm>
      )}
      <MobileCards
        empty={own ? "Chưa có bài học nào. Bấm \"+ Thêm bài học\" để tạo bài đầu tiên." : "Chưa có bài học nào."}
        items={lessons.map((l) => ({ key: l.id, href: `/ngan-hang-bai-hoc/${l.id}`, lead: l.orderNo, title: l.title, subtitle: own ? undefined : `GV: ${l.teacher.fullName}`, chips: [`${l._count.questions} câu hỏi`, `${l._count.exercises} bài tập`] }))}
      />
      <div className="hidden md:block">
      <Table head={own ? ["Bài", "Tên bài học", "Câu hỏi", "Bài tập", ""] : ["Bài", "Tên bài học", "Giáo viên", "Câu hỏi", "Bài tập", ""]}>
        {lessons.map((l) => (
          <tr key={l.id} className="align-middle [&>td]:!py-3">
            <td className="w-16 font-semibold text-slate-500">{l.orderNo}</td>
            <td className="min-w-48"><Link data-row href={`/ngan-hang-bai-hoc/${l.id}`} className="font-semibold text-orange-700 hover:underline">{l.title}</Link></td>
            {!own && <td className="text-sm">{l.teacher.fullName}</td>}
            <td>{l._count.questions}</td><td>{l._count.exercises}</td>
            <td className="text-right"><Link href={`/ngan-hang-bai-hoc/${l.id}`} className="inline-flex h-8 items-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-slate-50">Mở</Link></td>
          </tr>
        ))}
        {!lessons.length && <tr><td colSpan={own ? 5 : 6} className="py-8 text-center text-slate-500">{own ? "Chưa có bài học nào. Bấm \"+ Thêm bài học\" để tạo bài đầu tiên." : "Chưa có bài học nào."}</td></tr>}
      </Table>
      </div>
    </div>
  );
}
