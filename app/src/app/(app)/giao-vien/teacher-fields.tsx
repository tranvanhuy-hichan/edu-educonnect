import { Field, inputCls } from "@/components/ui";

const ic = inputCls + " w-full";
export function TeacherFields({ t = {}, roles = ["SUBJECT_TEACHER"], create = false }: { t?: { fullName?: string; phone?: string | null; email?: string }; roles?: string[]; create?: boolean }) {
  return (
    <>
      <fieldset className="w-full rounded-lg border p-4">
        <legend className="px-2 text-sm font-semibold">Thông tin giáo viên</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <Field label="Họ và tên *"><input name="fullName" defaultValue={t.fullName ?? ""} className={ic} required /></Field>
          <Field label="Số điện thoại"><input name="phone" defaultValue={t.phone ?? ""} className={ic} /></Field>
          {create && <Field label="Email đăng nhập *"><input type="email" name="email" className={ic} required /></Field>}
        </div>
      </fieldset>
      <fieldset className="w-full rounded-lg border p-4">
        <legend className="px-2 text-sm font-semibold">Vai trò (một tài khoản, menu tự gộp theo vai trò)</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {[["HOMEROOM_TEACHER", "Giáo viên chủ nhiệm (GVCN)"], ["SUBJECT_TEACHER", "Giáo viên bộ môn (GVBM)"]].map(([v, l]) => (
            <label key={v} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"><input type="checkbox" name="roles" value={v} defaultChecked={roles.includes(v)} />{l}</label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Được phân công chủ nhiệm / giảng dạy sẽ tự có thêm vai trò tương ứng.</p>
      </fieldset>
    </>
  );
}
