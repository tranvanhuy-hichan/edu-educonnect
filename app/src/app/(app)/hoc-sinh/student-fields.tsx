import { Field, inputCls } from "@/components/ui";
import { isoDate } from "@/lib/format";

const ic = inputCls + " w-full";
type S = { fullName?: string; dob?: Date | null; email?: string | null; guardianName?: string | null; guardianPhone?: string | null };
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <fieldset className="w-full rounded-lg border p-4"><legend className="px-2 text-sm font-semibold">{title}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div></fieldset>
);

export function StudentFields({ s = {}, classes, editing = false }: { s?: S; classes?: { id: string; label: string }[]; editing?: boolean }) {
  return (
    <>
      <Sec title="Thông tin học sinh">
        <Field label="Họ và tên *"><input name="fullName" defaultValue={s.fullName ?? ""} className={ic} required /></Field>
        <Field label="Ngày sinh"><input type="date" name="dob" defaultValue={s.dob ? isoDate(s.dob) : ""} className={ic} /></Field>
        {!editing && <Field label="Email đăng nhập (để trống = tự tạo)"><input type="email" name="email" defaultValue={s.email ?? ""} className={ic} /></Field>}
        {classes && <Field label="Xếp vào lớp (tùy chọn)"><select name="classId" className={ic}><option value="">-- chưa xếp lớp --</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>}
      </Sec>
      <Sec title="Phụ huynh / Người giám hộ">
        <Field label="Họ tên phụ huynh"><input name="guardianName" defaultValue={s.guardianName ?? ""} className={ic} /></Field>
        <Field label="SĐT phụ huynh"><input name="guardianPhone" defaultValue={s.guardianPhone ?? ""} className={ic} /></Field>
      </Sec>
    </>
  );
}
