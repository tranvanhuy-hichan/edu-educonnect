import { Field, inputCls } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { isoDate } from "@/lib/format";

const ic = inputCls + " w-full";
type S = {
  fullName?: string; dob?: Date | null; email?: string | null; gender?: string | null; birthPlace?: string | null; ethnicity?: string | null; idNumber?: string | null;
  phone?: string | null; contactEmail?: string | null; address?: string | null; note?: string | null;
  guardianName?: string | null; guardianPhone?: string | null; guardianRelation?: string | null; guardianEmail?: string | null; guardianJob?: string | null;
};
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <fieldset className="content-panel w-full rounded-lg border p-4"><legend className="px-2 text-sm font-semibold">{title}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div></fieldset>
);
const In = ({ name, label, v, ...rest }: { name: string; label: string; v?: string | null } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <Field label={label}><input name={name} defaultValue={v ?? ""} className={ic} {...rest} /></Field>
);

export function StudentFields({ s = {}, classes, editing = false }: { s?: S; classes?: { id: string; label: string }[]; editing?: boolean }) {
  return (
    <>
      <Sec title="Thông tin học sinh">
        <In name="fullName" label="Họ và tên *" v={s.fullName} required />
        <Field label="Giới tính"><select name="gender" defaultValue={s.gender ?? ""} className={ic}><option value="">--</option><option value="MALE">Nam</option><option value="FEMALE">Nữ</option><option value="OTHER">Khác</option></select></Field>
        <Field label="Ngày sinh"><input type="date" name="dob" defaultValue={s.dob ? isoDate(s.dob) : ""} className={ic} /></Field>
        <In name="birthPlace" label="Nơi sinh" v={s.birthPlace} />
        <In name="ethnicity" label="Dân tộc" v={s.ethnicity} />
        <In name="idNumber" label="Số CCCD / Định danh cá nhân" v={s.idNumber} />
        <In name="phone" label="Số điện thoại học sinh" v={s.phone} />
        <In name="contactEmail" label="Email liên hệ" v={s.contactEmail} type="email" />
        <In name="address" label="Địa chỉ thường trú" v={s.address} />
        {!editing && <In name="email" label="Email đăng nhập (để trống = tự tạo)" v={s.email} type="email" />}
        {classes && <Field label="Xếp vào lớp (tùy chọn)"><SearchableSelect name="classId" emptyLabel="-- chưa xếp lớp --" className="w-full" options={classes.map((c) => ({ value: c.id, label: c.label }))} /></Field>}
      </Sec>
      <Sec title="Phụ huynh / Người giám hộ">
        <In name="guardianName" label="Họ tên phụ huynh" v={s.guardianName} />
        <Field label="Quan hệ với học sinh"><select name="guardianRelation" defaultValue={s.guardianRelation ?? ""} className={ic}><option value="">--</option>{["Bố", "Mẹ", "Ông/Bà", "Anh/Chị", "Người giám hộ", "Khác"].map((r) => <option key={r}>{r}</option>)}</select></Field>
        <In name="guardianPhone" label="SĐT phụ huynh" v={s.guardianPhone} />
        <In name="guardianEmail" label="Email phụ huynh" v={s.guardianEmail} type="email" />
        <In name="guardianJob" label="Nghề nghiệp" v={s.guardianJob} />
      </Sec>
      <Sec title="Ghi chú"><div className="sm:col-span-2 lg:col-span-3"><Field label="Ghi chú nội bộ (sức khoẻ, hoàn cảnh, lưu ý...)"><textarea name="note" rows={3} defaultValue={s.note ?? ""} className={inputCls + " h-auto w-full py-2"} /></Field></div></Sec>
    </>
  );
}
