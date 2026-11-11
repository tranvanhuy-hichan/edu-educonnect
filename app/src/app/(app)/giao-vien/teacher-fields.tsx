import { Field, inputCls } from "@/components/ui";
import { isoDate } from "@/lib/format";

const ic = inputCls + " w-full";
type T = { fullName?: string; phone?: string | null; gender?: string | null; dob?: Date | null; contactEmail?: string | null; address?: string | null; idNumber?: string | null; degree?: string | null; startDate?: Date | null; note?: string | null; subjectIds?: string[] };
const Sec = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <fieldset className="content-panel w-full rounded-lg border p-4">
    <legend className="px-2 text-sm font-semibold">{title}</legend>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div>
    {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
  </fieldset>
);
const In = ({ name, label, v, ...rest }: { name: string; label: string; v?: string | null } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <Field label={label}><input name={name} defaultValue={v ?? ""} className={ic} {...rest} /></Field>
);

export function TeacherFields({ t = {}, roles = ["SUBJECT_TEACHER"], create = false, subjects = [] }: { t?: T; roles?: string[]; create?: boolean; subjects?: { id: string; subjectName: string }[] }) {
  return (
    <>
      <Sec title="Thông tin cá nhân">
        <In name="fullName" label="Họ và tên *" v={t.fullName} required />
        <Field label="Giới tính"><select name="gender" defaultValue={t.gender ?? ""} className={ic}><option value="">--</option><option value="MALE">Nam</option><option value="FEMALE">Nữ</option><option value="OTHER">Khác</option></select></Field>
        <Field label="Ngày sinh"><input type="date" name="dob" defaultValue={t.dob ? isoDate(t.dob) : ""} className={ic} /></Field>
        <In name="idNumber" label="Số CCCD / CMND" v={t.idNumber} />
        <In name="phone" label="Số điện thoại" v={t.phone} />
        <In name="contactEmail" label="Email liên hệ" v={t.contactEmail} type="email" />
        <In name="address" label="Địa chỉ" v={t.address} />
        {create && <In name="email" label="Email đăng nhập *" type="email" required />}
      </Sec>
      <Sec title="Chuyên môn & công tác">
        <In name="degree" label="Trình độ / Bằng cấp (vd: Cử nhân Sư phạm Toán)" v={t.degree} />
        <Field label="Ngày bắt đầu công tác"><input type="date" name="startDate" defaultValue={t.startDate ? isoDate(t.startDate) : ""} className={ic} /></Field>
      </Sec>
      <fieldset className="content-panel w-full rounded-lg border p-4">
        <legend className="px-2 text-sm font-semibold">Môn phụ trách *</legend>
        <div className="flex flex-wrap gap-2 text-sm">
          {subjects.map((s) => (
            <label key={s.id} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"><input type="checkbox" name="subjectIds" value={s.id} defaultChecked={t.subjectIds?.includes(s.id)} />{s.subjectName}</label>
          ))}
          {!subjects.length && <p className="text-slate-500">Chưa có môn học nào. Hãy tạo môn học trước.</p>}
        </div>
        <p className="mt-2 text-xs text-slate-500">Giáo viên chỉ được phân công giảng dạy, đăng bài học và giao bài tập ở các môn được chọn tại đây (có thể chọn nhiều môn).</p>
      </fieldset>
      <fieldset className="content-panel w-full rounded-lg border p-4">
        <legend className="px-2 text-sm font-semibold">Vai trò (một tài khoản, menu tự gộp theo vai trò)</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {[["HOMEROOM_TEACHER", "Giáo viên chủ nhiệm (GVCN)"], ["SUBJECT_TEACHER", "Giáo viên bộ môn (GVBM)"]].map(([v, l]) => (
            <label key={v} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"><input type="checkbox" name="roles" value={v} defaultChecked={roles.includes(v)} />{l}</label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Được phân công chủ nhiệm / giảng dạy sẽ tự có thêm vai trò tương ứng.</p>
      </fieldset>
      <Sec title="Ghi chú"><div className="sm:col-span-2 lg:col-span-3"><Field label="Ghi chú nội bộ"><textarea name="note" rows={3} defaultValue={t.note ?? ""} className={inputCls + " h-auto w-full py-2"} /></Field></div></Sec>
    </>
  );
}
