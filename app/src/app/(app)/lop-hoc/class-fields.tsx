import { Field, inputCls } from "@/components/ui";

type Opt = { id: string; label: string };
const ic = inputCls + " w-full";

/** Các ô nhập thông tin lớp (dùng ở tab Thông tin của trang chi tiết lớp). */
export function ClassFormFields({ grades, years, teachers, rooms, subjects, defaults = {} }: { grades: Opt[]; years: Opt[]; teachers: Opt[]; rooms: Opt[]; subjects: Opt[]; defaults?: Partial<{ subjectIds: string[]; roomId: string | null; shift: "MORNING" | "AFTERNOON"; name: string; gradeLevelId: string; academicYearId: string; homeroomTeacherId: string | null }> }) {
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Tên lớp *"><input name="name" defaultValue={defaults.name} className={ic} required /></Field>
      <Field label="Khối *"><select name="gradeLevelId" defaultValue={defaults.gradeLevelId ?? ""} className={ic} required><option value="">-- chọn khối --</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></Field>
      <Field label="Năm học *"><select name="academicYearId" defaultValue={defaults.academicYearId ?? ""} className={ic} required><option value="">-- chọn năm học --</option>{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select></Field>
      <Field label="Ca học *">
        <select name="shift" defaultValue={defaults.shift ?? "MORNING"} className={ic} required>
          <option value="MORNING">Ca sáng (Tiết 1 – 5)</option>
          <option value="AFTERNOON">Ca chiều (Tiết 6 – 10)</option>
        </select>
      </Field>
      <Field label="Phòng học cố định *"><select name="roomId" defaultValue={defaults.roomId ?? ""} className={ic} required><option value="">-- chọn phòng --</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.label}</option>)}</select></Field>
      <Field label="Giáo viên chủ nhiệm"><select name="homeroomTeacherId" defaultValue={defaults.homeroomTeacherId ?? ""} className={ic}><option value="">-- chưa phân công --</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
      <p className="col-span-full text-xs text-slate-500">
        💡 Mỗi phòng học có thể dùng chung giữa 1 lớp ca sáng và 1 lớp ca chiều. Trong cùng một ca học (buổi học), hệ thống đảm bảo không bao giờ có 2 lớp học chung một phòng.
      </p>
      <fieldset className="col-span-full rounded-lg border p-3"><legend className="px-2 text-sm font-semibold">Môn học của lớp *</legend><p className="mb-3 text-xs text-slate-500">Danh sách dùng chung cho phân công, thời khóa biểu và lịch thi.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{subjects.map((subject) => <label key={subject.id} className="flex items-center gap-2 text-sm"><input name="subjectIds" type="checkbox" value={subject.id} defaultChecked={defaults.subjectIds?.includes(subject.id)} />{subject.label}</label>)}</div></fieldset>
    </div>
  );
}
