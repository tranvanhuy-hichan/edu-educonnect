import { AutoForm } from "@/components/auto-form";
import Link from "next/link";
import { ToolbarActions } from "@/components/toolbar-actions";
import { db } from "@/lib/db";
import { requireRole, ADMIN_ROLES } from "@/lib/guard";
import { DialogButton } from "@/components/dialog";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, Table, Tabs, Title } from "@/components/ui";
import { fmtDate, isoDate } from "@/lib/format";
import { NewYearFields, TermDatesFields } from "@/components/term-period";
import { FilePicker } from "@/components/file-picker";
import { PolicyForm } from "./policy-form";
import { getPolicy } from "@/lib/policy";
import { getConfigCounts } from "@/lib/catalog-cache";
import { getSchoolSetting } from "@/lib/school-setting";
import { addAcademicTerm, addAcademicYear, addGradeLevel, deleteAcademicTerm, deleteAcademicYear, deleteGradeLevel, removeSchoolLogo, saveScoreWeights, updateAcademicTerm, updateAcademicYear, updateGradeLevel, updateSchoolBrand } from "./actions";

const TABS = [["years", "Năm học"], ["catalogs", "Danh mục"], ["policy", "Quy chế"], ["brand", "Giao diện"], ["system", "Hệ thống"]] as const;

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string; section?: string }> }) {
  await requireRole(...ADMIN_ROLES);
  const sp = await searchParams;
  const requested = sp.tab === "grades" ? "catalogs" : sp.tab === "weights" ? "policy" : sp.tab;
  const tab = TABS.some(([k]) => k === requested) ? requested! : "years";
  const section = sp.tab === "weights" || sp.section === "weights" ? "weights" : "general";

  const { years: yearCount, grades: gradeCount, terms: termCount } = await getConfigCounts();
  const counts: Record<string, number> = { years: yearCount, catalogs: gradeCount, weights: termCount, policy: 0, brand: 0 };
  const [years, grades, terms] = await Promise.all([
    tab === "years" ? db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      include: { _count: { select: { classes: true } }, terms: { orderBy: { termName: "asc" }, include: { _count: { select: { assignments: true, timetableSlots: true } } } } },
    }) : Promise.resolve([]),
    tab === "catalogs" ? db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { classes: true } } } }) : Promise.resolve([]),
    tab === "policy" && section === "weights" ? db.academicTerm.findMany({ orderBy: [{ academicYear: { startDate: "desc" } }, { termName: "asc" }], include: { academicYear: true, scoreWeightConfig: true } }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <Title>Cấu hình & Cài đặt</Title>
      <Tabs current={`?tab=${tab}`} items={TABS.map(([k, l]) => [`?tab=${k}`, !["years", "catalogs"].includes(k) ? l : `${l} (${counts[k]})`] as [string, string])} />

      {tab === "policy" && <AutoForm className="flex flex-wrap items-center gap-2"><input type="hidden" name="tab" value="policy" /><label className="flex w-full items-center gap-2 text-sm text-slate-500 sm:w-auto"><span className="shrink-0">Nội dung quy chế</span><select key={section} name="section" defaultValue={section} className={inputCls + " min-w-0 flex-1 sm:flex-none"}><option value="general">Quy chế chung</option><option value="weights">Hệ số điểm</option></select></label></AutoForm>}
      {tab === "policy" && section === "general" && <PolicyForm initial={await getPolicy()} />}
      {tab === "system" && <div className="grid gap-3 md:grid-cols-2">{[["/van-hanh", "Vận hành hệ thống", "Theo dõi tác vụ và tình trạng hoạt động."], ["/nhat-ky", "Nhật ký hoạt động", "Tra cứu lịch sử thao tác."], ["/thung-rac", "Thùng rác", "Xem và khôi phục dữ liệu đã xóa."], ["/ket-noi-api", "Kết nối API", "Quản lý quyền truy cập từ hệ thống khác."]].map(([href,title,hint]) => <Link key={href} href={href} className="rounded-lg border bg-white p-4 hover:bg-slate-50"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{hint}</p></Link>)}</div>}

      {tab === "years" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Năm học</h2>
            <ToolbarActions label="Thao tác cấu hình"><DialogButton label="+ Thêm năm học" title="Thêm năm học">
              <ActionForm action={addAcademicYear} submit="Thêm năm học" className="flex flex-col gap-3 [&>button]:self-start">
                <NewYearFields />
              </ActionForm>
            </DialogButton></ToolbarActions>
          </div>
          {years.map((y) => (
            <Card key={y.id} className="flat-rows p-0">
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
                      <TermDatesFields />
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
              <Table bare head={["Học kỳ", "Thời gian", "Số tuần", "Phân công", "Tiết TKB", ""]}>
                {y.terms.map((t) => (
                  <tr key={t.id} className="align-middle">
                    <td className="font-semibold">{t.termName}</td>
                    <td>{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</td>
                    <td>{Math.ceil(((t.endDate.getTime() - t.startDate.getTime()) / 86400_000 + 1) / 7)} tuần</td>
                    <td>{t._count.assignments}</td>
                    <td>{t._count.timetableSlots}</td>
                    <td><div className="flex items-center gap-2">
                      <DialogButton label="Sửa" title={`Sửa ${t.termName} · ${y.yearName}`} variant="secondary" size="sm">
                        <ActionForm action={updateAcademicTerm} submit="Lưu" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                          <input type="hidden" name="id" value={t.id} />
                          <TermDatesFields defaultStart={isoDate(t.startDate)} defaultEnd={isoDate(t.endDate)} />
                          {(t._count.assignments > 0 || t._count.timetableSlots > 0) && <p className="text-xs text-amber-700">Học kỳ đã có phân công/thời khóa biểu. Đổi ngày sẽ không xóa dữ liệu nhưng hãy kiểm tra lại lịch.</p>}
                        </ActionForm>
                      </DialogButton>
                      <ActionForm action={deleteAcademicTerm} submit="Xoá" compact danger confirmText={`Xoá ${t.termName}?`} className="inline-flex"><input type="hidden" name="id" value={t.id} /></ActionForm>
                    </div></td>
                  </tr>
                ))}
                {!y.terms.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Chưa có học kỳ. Bấm &quot;+ Học kỳ&quot; để thêm HK1/HK2.</td></tr>}
              </Table>
            </Card>
          ))}
          {!years.length && <Card className="text-center text-sm text-slate-500">Chưa có năm học nào. Bấm &quot;+ Thêm năm học&quot; để tạo năm học đầu tiên.</Card>}
        </div>
      )}

      {tab === "catalogs" && (
        <Card mobile="flat">
          <div className="mb-4 flex flex-wrap gap-2"><Link href="/mon-hoc" className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50">Môn học →</Link><Link href="/phong-hoc" className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50">Phòng học →</Link></div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Khối lớp</h2>
            <ToolbarActions label="Thao tác cấu hình"><DialogButton label="+ Thêm khối" title="Thêm khối lớp">
              <ActionForm action={addGradeLevel} submit="Thêm khối" className="flex flex-col gap-3 [&>button]:self-start">
                <Field label="Tên khối"><input name="gradeName" className={inputCls + " w-full"} placeholder="vd: Khối 11" required /></Field>
                <Field label="Thứ tự sắp xếp"><input name="sortOrder" defaultValue={11} className={inputCls + " w-full"} /></Field>
              </ActionForm>
            </DialogButton></ToolbarActions>
          </div>
          <div className="flat-rows"><Table bare head={["Khối", "Thứ tự", "Số lớp", ""]}>
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
          </Table></div>
        </Card>
      )}

      {tab === "policy" && section === "weights" && (
        <Card mobile="flat" className="space-y-3">
          <div>
            <h2 className="font-semibold">Hệ số điểm theo học kỳ</h2>
            <p className="mt-1 text-sm text-slate-600">Hệ số đánh giá THPT: thường xuyên 1, giữa kỳ 2, cuối kỳ 3. Điểm cả năm từng môn = (HK1 + HK2 × 2) / 3. Kết quả thiếu cột điểm chỉ là tạm tính; chưa đủ điều kiện tổng kết. Chỉ đồng bộ cấu hình ở học kỳ chưa khóa.</p>
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
                      <input name="txWeight" readOnly value={1} className={inputCls + " w-16"} aria-label="Hệ số thường xuyên" title="Thường xuyên (TX)" />
                      <input name="gkWeight" readOnly value={2} className={inputCls + " w-16"} aria-label="Hệ số giữa kỳ" title="Giữa kỳ (GK)" />
                      <input name="ckWeight" readOnly value={3} className={inputCls + " w-16"} aria-label="Hệ số cuối kỳ" title="Cuối kỳ (CK)" />
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
          <Card mobile="flat" className="space-y-6">
            <div>
              <h2 className="font-semibold">Tên trường & logo</h2>
              <p className="mt-1 text-sm text-slate-600">Hiện ở sidebar, trang đăng nhập và tiêu đề trình duyệt của toàn hệ thống.</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="flex flex-col items-center gap-4 rounded-xl border bg-slate-50/60 p-6 text-center dark:bg-slate-800/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="size-32 rounded-full border-2 border-white object-cover shadow-md" /> : (
                  <div className="theme-sidebar grid size-32 place-items-center rounded-full text-5xl font-bold shadow-md" style={{ color: "var(--sb-fg)" }}>{brand.schoolName.slice(0, 1).toUpperCase()}</div>
                )}
                <div>
                  <p className="font-semibold">{brand.schoolName}</p>
                  <p className="text-xs text-slate-500">Logo hiện tại · hiển thị hình tròn</p>
                </div>
                {brand.logoUrl && (
                  <ActionForm action={removeSchoolLogo} submit="Xoá logo" compact danger confirmText="Xoá logo hiện tại? Hệ thống sẽ hiện chữ cái đầu tên trường thay cho logo." className="inline-flex" />
                )}
              </div>
              <ActionForm action={updateSchoolBrand} submit="Lưu giao diện" reset={false} className="flex flex-col gap-5 [&>button]:self-start">
                <Field label="Tên trường"><input name="schoolName" defaultValue={brand.schoolName} className={inputCls + " w-full"} required /></Field>
                <Field label="Logo mới (tuỳ chọn)">
                  <FilePicker name="logo" accept="image/*" maxMB={5} round hint="Ảnh vuông, PNG hoặc JPG. Logo được cắt tròn khi hiển thị. Bỏ trống nếu chỉ đổi tên trường." />
                </Field>
              </ActionForm>
            </div>
          </Card>
        );
      })()}
    </div>
  );
}
