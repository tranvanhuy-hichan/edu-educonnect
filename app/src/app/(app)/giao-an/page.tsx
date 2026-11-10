import { FileText } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { canManageClassSubjectAssignment } from "@/lib/auth/permission";
import { DialogButton } from "@/components/dialog";
import { ActionForm } from "@/components/action-form";
import { AutoForm } from "@/components/auto-form";
import { MobileCollapse } from "@/components/mobile-collapse";
import { Field, inputCls, Table, Title } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { fmtDate } from "@/lib/format";
import { assignmentWhere, isStudentOnly } from "@/server/learning-scope";
import { createPlan, deletePlan, updatePlan } from "./actions";

export default async function LessonPlans({ searchParams }: { searchParams: Promise<{ q?: string; assignmentId?: string; page?: string; size?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES, "STUDENT");
  const sp = await searchParams;
  const pg = getPaging(sp);
  const student = isStudentOnly(me);
  const scope = assignmentWhere(me);
  const where: Prisma.LessonPlanWhereInput = {
    assignment: { AND: [scope, sp.assignmentId ? { id: sp.assignmentId } : {}] },
    ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" as const } } : {}),
  };
  const [assignments, total, plans] = await Promise.all([
    db.classSubjectAssignment.findMany({ where: scope, orderBy: [{ schoolClass: { className: "asc" } }, { subject: { subjectName: "asc" } }], include: { schoolClass: true, subject: true, academicTerm: true } }),
    db.lessonPlan.count({ where }),
    db.lessonPlan.findMany({ where, orderBy: { publishedAt: "desc" }, skip: pg.skip, take: pg.take, include: { assignment: { include: { schoolClass: true, subject: true, academicTerm: true } } } }),
  ]);
  const label = (a: (typeof assignments)[number]) => `${a.schoolClass.className} · ${a.subject.subjectName} · ${a.academicTerm.termName}`;
  const canEdit = !student;
  const editable = new Set<string>();
  if (canEdit) for (const p of plans) if (await canManageClassSubjectAssignment(me, p.assignmentId)) editable.add(p.id);

  return (
    <div className="space-y-4">
      <Title right={canEdit && assignments.length > 0 && <DialogButton label="+ Đăng giáo án" title="Đăng giáo án" wide>
        <ActionForm action={createPlan} submit="Đăng giáo án" className="flex flex-col gap-3 [&>button]:self-start">
          <Field label="Lớp · môn"><select name="assignmentId" defaultValue={sp.assignmentId ?? ""} className={inputCls + " w-full"} required><option value="">-- chọn lớp · môn --</option>{assignments.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}</select></Field>
          <Field label="Tiêu đề"><input name="title" className={inputCls + " w-full"} required /></Field>
          <Field label="Nội dung giáo án"><textarea name="content" rows={10} className={inputCls + " h-auto w-full py-2"} required /></Field>
          <Field label="Link tài liệu đính kèm (Google Drive...)"><input name="attachment" className={inputCls + " w-full"} placeholder="https://" /></Field>
        </ActionForm>
      </DialogButton>}>Giáo án ({total})</Title>

      <AutoForm className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Tìm giáo án..." className={inputCls + " min-w-0 flex-1 md:min-w-48"} />
        <MobileCollapse active={[sp.assignmentId].filter(Boolean).length}>
          <select name="assignmentId" defaultValue={sp.assignmentId ?? ""} className={inputCls}><option value="">Tất cả lớp · môn</option>{assignments.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}</select>
        </MobileCollapse>
      </AutoForm>

      <Table head={["Giáo án", "Lớp · môn", "Ngày đăng", ""]}>
        {plans.map((p) => (
          <tr key={p.id} className="align-middle [&>td]:!py-3">
            <td className="min-w-48">
              <DialogButton label={p.title} title={p.title} variant="ghost" wide>
                <p className="mb-3 whitespace-pre-line text-sm text-slate-700">{p.content}</p>
                {p.attachment && <a href={p.attachment} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 hover:underline"><FileText className="size-4" />Tài liệu đính kèm</a>}
              </DialogButton>
            </td>
            <td>{label(p.assignment)}</td>
            <td>{fmtDate(p.publishedAt)}</td>
            <td className="whitespace-nowrap">{editable.has(p.id) && (
              <div className="flex items-center gap-2">
                <DialogButton label="Sửa" title="Sửa giáo án" size="sm" variant="secondary" wide>
                  <ActionForm action={updatePlan} submit="Lưu" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                    <input type="hidden" name="id" value={p.id} />
                    <Field label="Tiêu đề"><input name="title" defaultValue={p.title} className={inputCls + " w-full"} required /></Field>
                    <Field label="Nội dung giáo án"><textarea name="content" rows={10} defaultValue={p.content} className={inputCls + " h-auto w-full py-2"} required /></Field>
                    <Field label="Link tài liệu đính kèm"><input name="attachment" defaultValue={p.attachment ?? ""} className={inputCls + " w-full"} placeholder="https://" /></Field>
                  </ActionForm>
                </DialogButton>
                <ActionForm action={deletePlan} submit="Xoá" compact danger confirmText="Xoá giáo án?" className="inline-flex"><input type="hidden" name="id" value={p.id} /></ActionForm>
              </div>
            )}</td>
          </tr>
        ))}
        {!plans.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">{canEdit ? 'Chưa có giáo án. Bấm "+ Đăng giáo án" để đăng.' : "Chưa có giáo án nào cho lớp của em."}</td></tr>}
      </Table>
      <Pagination total={total} page={pg.page} size={pg.size} path="/giao-an" params={{ q: sp.q, assignmentId: sp.assignmentId, size: sp.size }} />
    </div>
  );
}
