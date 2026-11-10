"use client";
import { useActionState, useState } from "react";
import { BookOpenCheck, GraduationCap } from "lucide-react";
import { createClass } from "../actions";

type Opt = { id: string; label: string };
const ic = "h-10 w-full rounded-md border bg-white px-3 text-sm";

const Section = ({ icon: I, title, hint, children }: { icon: typeof GraduationCap; title: string; hint?: string; children: React.ReactNode }) => (
  <section className="rounded-lg border bg-white">
    <div className="flex items-center gap-3 border-b px-5 py-3">
      <span className="grid size-8 place-items-center rounded-lg bg-orange-100 text-orange-700"><I className="size-4" /></span>
      <div><h2 className="font-semibold leading-tight">{title}</h2>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
    </div>
    <div className="p-5">{children}</div>
  </section>
);
const F = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">{label}{children}{hint && <span className="font-normal text-slate-400">{hint}</span>}</label>
);

export function NewClassForm({ grades, years, teachers, rooms, subjects, defaultYearId }: { grades: Opt[]; years: Opt[]; teachers: Opt[]; rooms: Opt[]; subjects: Opt[]; defaultYearId: string }) {
  const [res, action, pending] = useActionState(createClass, null);
  const [name, setName] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [yearId, setYearId] = useState(defaultYearId);
  const [shift, setShift] = useState<"MORNING" | "AFTERNOON">("MORNING");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [roomId, setRoomId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const label = (list: Opt[], id: string) => list.find((x) => x.id === id)?.label;

  return (
    <form action={action} className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Section icon={BookOpenCheck} title="Thông tin lớp" hint="Tên lớp, ca học, phòng học, khối và năm học">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><F label="Tên lớp *"><input name="name" value={name} onChange={(e) => setName(e.target.value)} className={ic} placeholder="vd: 10A1" required /></F></div>
            <F label="Ca học *" hint="Buổi học chính khóa của lớp (sáng hoặc chiều)">
              <select name="shift" value={shift} onChange={(e) => setShift(e.target.value as "MORNING" | "AFTERNOON")} className={ic} required>
                <option value="MORNING">Ca sáng (Tiết 1 – 5)</option>
                <option value="AFTERNOON">Ca chiều (Tiết 6 – 10)</option>
              </select>
            </F>
            <F label="Phòng học cố định *" hint="1 phòng có thể chia cho 1 lớp sáng & 1 lớp chiều">
              <select name="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)} required className={ic}>
                <option value="">-- chọn phòng --</option>
                {rooms.map((room) => <option key={room.id} value={room.id}>{room.label}</option>)}
              </select>
            </F>
            <F label="Khối *"><select name="gradeLevelId" value={gradeId} onChange={(e) => setGradeId(e.target.value)} className={ic} required><option value="">-- chọn khối --</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></F>
            <F label="Năm học *"><select name="academicYearId" value={yearId} onChange={(e) => setYearId(e.target.value)} className={ic} required><option value="">-- chọn năm học --</option>{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select></F>
          </div>
        </Section>

        <Section icon={BookOpenCheck} title="Môn học của lớp" hint="Phân công giáo viên, thời khóa biểu và lịch thi đều dùng danh sách này">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{subjects.map((subject) => <label key={subject.id} className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" name="subjectIds" value={subject.id} checked={subjectIds.includes(subject.id)} onChange={(event) => setSubjectIds((ids) => event.target.checked ? [...ids, subject.id] : ids.filter((id) => id !== subject.id))} />{subject.label}</label>)}</div>
          {!subjects.length && <p className="text-sm text-slate-500">Thêm môn trong danh mục Môn học trước khi tạo lớp.</p>}
        </Section>

        <Section icon={GraduationCap} title="Giáo viên chủ nhiệm" hint="Có thể chọn sau. Giáo viên được giao chủ nhiệm tự có thêm chức năng chủ nhiệm trong cùng một tài khoản">
          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><GraduationCap className="size-4 text-orange-700" /> GVCN</div>
            <select name="homeroomTeacherId" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={ic}><option value="">-- chưa phân công --</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            <p className="mt-1.5 text-xs text-slate-500">GVCN quản lý danh sách học sinh, bảng điểm, thi đua và sổ đầu bài của lớp mình chủ nhiệm.</p>
          </div>
        </Section>
      </div>

      {/* ===== Tóm tắt (cột phải) ===== */}
      <aside className="xl:sticky xl:top-20 xl:self-start">
        <div className="space-y-3 rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Tóm tắt lớp</h2>
          <div className="rounded-md bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Tên lớp</div>
            <div className="font-semibold">{name || <span className="font-normal text-slate-400">Chưa nhập</span>}</div>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Khối</dt><dd className="font-medium">{label(grades, gradeId) ?? "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Năm học</dt><dd className="font-medium">{label(years, yearId) ?? "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Ca học</dt><dd className="font-semibold text-orange-700">{shift === "MORNING" ? "Ca sáng (Tiết 1–5)" : "Ca chiều (Tiết 6–10)"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Phòng học</dt><dd>{label(rooms, roomId) ?? "Chưa chọn"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Môn học</dt><dd>{subjectIds.length} môn</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">GVCN</dt><dd className="font-medium text-orange-700">{label(teachers, teacherId) ?? "Chưa phân công"}</dd></div>
          </dl>
          <button disabled={pending || !name.trim() || !gradeId || !yearId || !roomId || !subjectIds.length} className="h-10 w-full rounded-md bg-orange-600 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Đang tạo..." : "Tạo lớp"}</button>
          {res?.error && <p className="whitespace-pre-line text-sm text-red-600">{res.error}</p>}
        </div>
      </aside>
    </form>
  );
}
