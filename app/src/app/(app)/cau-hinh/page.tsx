import { db } from "@/lib/db";
import { requireRole, ADMIN_ROLES } from "@/lib/guard";
import { DialogButton } from "@/components/dialog";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, Table, Tabs, Title } from "@/components/ui";
import { fmtDate, isoDate } from "@/lib/format";
import { getSchoolSetting } from "@/lib/school-setting";
import { addAcademicTerm, addAcademicYear, addGradeLevel, deleteAcademicTerm, deleteAcademicYear, deleteGradeLevel, removeSchoolLogo, saveScoreWeights, updateAcademicYear, updateGradeLevel, updateSchoolBrand } from "./actions";

const TABS = [["years", "Năm học & học kỳ"], ["grades", "Khối lớp"], ["weights", "Hệ số điểm"], ["brand", "Giao diện"]] as const;

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole(...ADMIN_ROLES);
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "years";

  const [yearCount, gradeCount, termCount] = await Promise.all([db.academicYear.count(), db.gradeLevel.count(), db.academicTerm.count()]);
  const counts: Record<string, number> = { years: yearCount, grades: gradeCount, weights: termCount, brand: 0 };
  const [years, grades, terms] = await Promise.all([
    tab === "years" ? db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      include: { _count: { select: { classes: true } }, terms: { orderBy: { termName: "asc" }, include: { _count: { select: { assignments: true, timetableSlots: true } } } } },
    }) : Promise.resolve([]),
    tab === "grades" ? db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { classes: true } } } }) : Promise.resolve([]),
    tab === "weights" ? db.academicTerm.findMany({ orderBy: [{ academicYear: { startDate: "desc" } }, { termName: "asc" }], include: { academicYear: true, scoreWeightConfig: true } }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <Title>Cấu hình</Title>
      <Tabs current={`?tab=${tab}`} items={TABS.map(([k, l]) => [`?tab=${k}`, k === "brand" ? l : `${l} (${counts[k]})`] as [string, string])} />

      {tab === "years" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Năm học</h2>
            <DialogButton label="+ Thêm năm học" title="Thêm năm học">
              <ActionForm action={addAcademicYear} submit="Thêm năm học" className="flex flex-col gap-3 [&>button]:self-start">
                <Field label="Tên năm học"><input name="yearName" className={inputCls + " w-full"} placeholder="vd: 2027-2028" required /></Field>
                <Field label="Ngày bắt đầu"><input type="date" name="startDate" className={inputCls + " w-full"} required /></Field>
                <p className="text-xs text-slate-500">Tuần 1 của Sổ đầu bài tính từ tuần chứa ngày bắt đầu này; sang năm học mới, số tuần đếm lại từ đầu.</p>
                <Field label="Ngày kết thúc"><input type="date" name="endDate" className={inputCls + " w-full"} required /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="createTerms" defaultChecked className="size-4" /> Tạo luôn HK1 và HK2 (chia đôi thời gian năm học)</label>
              </ActionForm>
            </DialogButton>
          </div>
          {years.map((y) => (
            <Card key={y.id} className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <h3 className="font-semibold">Năm học {y.yearName}</h3>
                  <div className="text-xs text-slate-500">{fmtDate(y.startDate)} – {fmtDate(y.endDate)} · {y._count.classes} lớp</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogButton label="+ Học kỳ" title={`Thêm học kỳ · ${y.yearName}`} variant="secondary" size="sm">
                    <ActionForm action={addAcademicTerm} submit="Thêm học kỳ" className="flex flex-col gap-3 [&>button]:self-start">
                      <input type="hidden" name="academicYearId" value={y.id} />
                      <Field label="Học kỳ"><select name="termName" className={inputCls + " w-full"}><option value="HK1">HK1</option><option value="HK2">HK2</option></select></Field>
                      <Field label="Ngày bắt đầu"><input type="date" name="startDate" defaultValue={isoDate(y.startDate)} className={inputCls + " w-full"} required /></Field>
                <p className="text-xs text-slate-500">Tuần 1 của Sổ đầu bài tính từ tuần chứa ngày bắt đầu này; sang năm học mới, số tuần đếm lại từ đầu.</p>
                      <Field label="Ngày kết thúc"><input type="date" name="endDate" defaultValue={isoDate(y.endDate)} className={inputCls + " w-full"} required /></Field>
                    </ActionForm>
                  </DialogButton>
                  <DialogButton label="Sửa" title={`Sửa năm học ${y.yearName}`} variant="secondary" size="sm">
                    <ActionForm action={updateAcademicYear} submit="Lưu" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                      <input type="hidden" name="id" value={y.id} />
                      <Field label="Tên năm học"><input name="yearName" defaultValue={y.yearName} className={inputCls + " w-full"} required /></Field>
                      <Field label="Ngày bắt đầu"><input type="date" name="startDate" defaultValue={isoDate(y.startDate)} className={inputCls + " w-full"} required /></Field>
                <p className="text-xs text-slate-500">Tuần 1 của Sổ đầu bài tính từ tuần chứa ngày bắt đầu này; sang năm học mới, số tuần đếm lại từ đầu.</p>
                      <Field label="Ngày kết thúc"><input type="date" name="endDate" defaultValue={isoDate(y.endDate)} className={inputCls + " w-full"} required /></Field>
                    </ActionForm>
                  </DialogButton>
                  <ActionForm action={deleteAcademicYear} submit="Xoá" compact danger confirmText={`Xoá năm học ${y.yearName}?`} className="inline-flex"><input type="hidden" name="id" value={y.id} /></ActionForm>
                </div>
              </div>
              <Table bare head={["Học kỳ", "Thời gian", "Phân công", "Tiết TKB", ""]}>
                {y.terms.map((t) => (
                  <tr key={t.id} className="align-middle">
                    <td className="font-semibold">{t.termName}</td>
                    <td>{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</td>
                    <td>{t._count.assignments}</td>
                    <td>{t._count.timetableSlots}</td>
                    <td><ActionForm action={deleteAcademicTerm} submit="Xoá" compact danger confirmText={`Xoá ${t.termName}?`} className="inline-flex"><input type="hidden" name="id" value={t.id} /></ActionForm></td>
                  </tr>
                ))}
                {!y.terms.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Chưa có học kỳ. Bấm &quot;+ Học kỳ&quot; để thêm HK1/HK2.</td></tr>}
              </Table>
            </Card>
          ))}
          {!years.length && <Card className="text-center text-sm text-slate-500">Chưa có năm học nào. Bấm &quot;+ Thêm năm học&quot; để tạo năm học đầu tiên.</Card>}
        </div>
      )}

      {tab === "grades" && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Khối lớp</h2>
            <DialogButton label="+ Thêm khối" title="Thêm khối lớp">
              <ActionForm action={addGradeLevel} submit="Thêm khối" className="flex flex-col gap-3 [&>button]:self-start">
                <Field label="Tên khối"><input name="gradeName" className={inputCls + " w-full"} placeholder="vd: Khối 11" required /></Field>
                <Field label="Thứ tự sắp xếp"><input name="sortOrder" defaultValue={11} className={inputCls + " w-full"} /></Field>
              </ActionForm>
            </DialogButton>
          </div>
          <Table bare head={["Khối", "Thứ tự", "Số lớp", ""]}>
            {grades.map((g) => (
              <tr key={g.id} className="align-middle">
                <td className="font-semibold">{g.gradeName}</td>
                <td>{g.sortOrder}</td>
                <td>{g._count.classes}</td>
                <td><div className="flex items-center justify-end gap-2">
                  <DialogButton label="Sửa" title={`Sửa ${g.gradeName}`} variant="secondary" size="sm">
                    <ActionForm action={updateGradeLevel} submit="Lưu" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                      <input type="hidden" name="id" value={g.id} />
                      <Field label="Tên khối"><input name="gradeName" defaultValue={g.gradeName} className={inputCls + " w-full"} required /></Field>
                      <Field label="Thứ tự sắp xếp"><input name="sortOrder" defaultValue={g.sortOrder} className={inputCls + " w-full"} /></Field>
                    </ActionForm>
                  </DialogButton>
                  <ActionForm action={deleteGradeLevel} submit="Xoá" compact danger confirmText={`Xoá ${g.gradeName}?`} className="inline-flex"><input type="hidden" name="id" value={g.id} /></ActionForm>
                </div></td>
              </tr>
            ))}
            {!grades.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Chưa có khối nào. Bấm &quot;+ Thêm khối&quot; để tạo.</td></tr>}
          </Table>
        </Card>
      )}

      {tab === "weights" && (
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">Hệ số điểm theo học kỳ</h2>
            <p className="mt-1 text-sm text-slate-600">Điểm trung bình môn = (Σ điểm thường xuyên × hệ số TX + điểm giữa kỳ × hệ số GK + điểm cuối kỳ × hệ số CK) ÷ (tổng hệ số của các cột đã có điểm). Chỉ <b>Quản trị hệ thống</b> được thay đổi; lưu xong, điểm trung bình đã tính của học kỳ đó được tính lại theo công thức mới. Học kỳ chưa cấu hình dùng mặc định 1 / 2 / 3.</p>
          </div>
          <Table bare head={["Học kỳ", "Năm học", "Hệ số điểm (TX / GK / CK)"]}>
            {terms.map((t) => {
              const c = t.scoreWeightConfig;
              return (
                <tr key={t.id} className="align-middle [&>td]:!py-3">
                  <td className="font-semibold">{t.termName}</td>
                  <td>{t.academicYear.yearName}{!c && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Mặc định 1/2/3</span>}</td>
                  <td>
                    <ActionForm action={saveScoreWeights} submit="Lưu" compact reset={false} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="academicTermId" value={t.id} />
                      <input name="txWeight" defaultValue={c?.txWeight ?? 1} className={inputCls + " w-16"} aria-label="Hệ số thường xuyên" title="Thường xuyên (TX)" />
                      <input name="gkWeight" defaultValue={c?.gkWeight ?? 2} className={inputCls + " w-16"} aria-label="Hệ số giữa kỳ" title="Giữa kỳ (GK)" />
                      <input name="ckWeight" defaultValue={c?.ckWeight ?? 3} className={inputCls + " w-16"} aria-label="Hệ số cuối kỳ" title="Cuối kỳ (CK)" />
                    </ActionForm>
                  </td>
                </tr>
              );
            })}
            {!terms.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Chưa có học kỳ nào. Hãy tạo năm học và học kỳ ở tab &quot;Năm học & học kỳ&quot; trước.</td></tr>}
          </Table>
        </Card>
      )}

      {tab === "brand" && await (async () => {
        const brand = await getSchoolSetting();
        return (
          <Card className="max-w-xl space-y-4">
            <div>
              <h2 className="font-semibold">Tên trường & logo</h2>
              <p className="mt-1 text-sm text-slate-600">Hiện ở sidebar, trang đăng nhập và tiêu đề trình duyệt của toàn hệ thống.</p>
            </div>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="size-16 rounded-full border object-cover" /> : (
                <div className="theme-sidebar grid size-16 place-items-center rounded-full text-xl font-bold" style={{ color: "var(--sb-fg)" }}>{brand.schoolName.slice(0, 1).toUpperCase()}</div>
              )}
              {brand.logoUrl && (
                <ActionForm action={removeSchoolLogo} submit="Xoá logo" compact danger confirmText="Xoá logo hiện tại? Hệ thống sẽ hiện chữ cái đầu tên trường thay cho logo." className="inline-flex" />
              )}
            </div>
            <ActionForm action={updateSchoolBrand} submit="Lưu giao diện" reset={false} className="flex flex-col gap-4 [&>button]:self-start">
              <Field label="Tên trường"><input name="schoolName" defaultValue={brand.schoolName} className={inputCls + " w-full"} required /></Field>
              <Field label="Logo mới (tuỳ chọn, hiển thị hình tròn)"><input name="logo" type="file" accept="image/*" className={inputCls + " w-full file:mr-3 file:rounded file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-orange-700"} /></Field>
              <p className="text-xs text-slate-500">Logo được cắt tròn khi hiển thị, đường kính bằng chiều rộng khung ảnh. Ảnh được lưu trên Cloudinary, tối đa 5MB. Bỏ trống nếu chỉ muốn đổi tên trường.</p>
            </ActionForm>
          </Card>
        );
      })()}
    </div>
  );
}
