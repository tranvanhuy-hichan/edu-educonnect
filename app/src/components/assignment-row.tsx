import Link from "next/link";
import { SearchableSelect } from "@/components/searchable-select";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { changeTeacher, createAssignment, deleteAssignment } from "@/app/(app)/phan-cong/actions";

type Assigned = { id: string; teacherId: string; teacher: { fullName: string }; _count?: { timetableSlots: number } };
export function AssignmentRow({ classId, className, termId, subject, assignment, teachers, canEdit, isAdmin }: {
  classId: string; className: string; termId: string; subject: { id: string; subjectName: string; defaultPeriodsPerWeek: number }; assignment: Assigned | null;
  teachers: { id: string; fullName: string; subjects: { subjectId: string }[] }[]; canEdit: boolean; isAdmin: boolean;
}) {
  // Chỉ giáo viên được phân công phụ trách môn này mới được chọn
  const eligible = teachers.filter((teacher) => teacher.subjects.some((x) => x.subjectId === subject.id));
  const none = <p className="text-xs text-amber-700">Chưa có giáo viên nào phụ trách môn này — vào hồ sơ giáo viên để chọn môn phụ trách.</p>;
  return <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <div className="min-w-40"><Link href={`/mon-hoc/${subject.id}`} className="font-medium hover:text-orange-700">{subject.subjectName}</Link><p className="mt-1 text-xs text-slate-500">{subject.defaultPeriodsPerWeek} tiết/tuần{assignment?._count?.timetableSlots ? ` · Đã xếp ${assignment._count.timetableSlots} tiết` : ""}</p></div>
    {assignment ? <div className="flex flex-wrap items-center gap-3"><Link href={`/giao-vien/${assignment.teacherId}`} className="text-sm font-medium text-orange-700">{assignment.teacher.fullName}</Link>{canEdit && <DialogButton variant="secondary" size="sm" label="Đổi giáo viên" title={`${className} · ${subject.subjectName}`}><ActionForm action={changeTeacher} submit="Đổi giáo viên" className="flex flex-col gap-3"><input type="hidden" name="id" value={assignment.id} /><SearchableSelect name="teacherId" required placeholder="Chọn giáo viên mới" ariaLabel="Giáo viên mới" className="w-full" options={eligible.filter((teacher) => teacher.id !== assignment.teacherId).map((teacher) => ({ value: teacher.id, label: teacher.fullName }))} /></ActionForm></DialogButton>}{isAdmin && <ActionForm action={deleteAssignment} submit="Gỡ phân công" compact ghost danger confirmText="Gỡ giáo viên khỏi môn này? Môn vẫn được giữ trong danh sách môn học của lớp." className="inline-flex"><input type="hidden" name="id" value={assignment.id} /></ActionForm>}</div> : <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Chưa có giáo viên</span>{canEdit && (!eligible.length ? none : <ActionForm action={createAssignment} submit="Phân công" reset={false} className="flex flex-wrap items-center gap-2"><input type="hidden" name="classId" value={classId} /><input type="hidden" name="subjectId" value={subject.id} /><input type="hidden" name="termId" value={termId} /><SearchableSelect name="teacherId" required placeholder="Chọn giáo viên" ariaLabel={`Giáo viên ${className} môn ${subject.subjectName}`} className="w-56 max-w-64" options={eligible.map((teacher) => ({ value: teacher.id, label: teacher.fullName }))} /></ActionForm>)}</div>}
  </li>;
}
