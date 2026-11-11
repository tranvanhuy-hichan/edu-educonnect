import Link from "next/link";
import { SearchableSelect } from "@/components/searchable-select";
import { Medal, Trophy, TrendingDown, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { ToolbarActions } from "@/components/toolbar-actions";
import { AutoForm } from "@/components/auto-form";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { MobileCollapse } from "@/components/mobile-collapse";
import { ViewToggle, pickView } from "@/components/view-toggle";
import { Card, Field, inputCls, Table, Tabs, Title } from "@/components/ui";
import { ColumnChart } from "@/components/charts";
import { computeEmulation, parsePeriodRange } from "@/modules/emulation/emulation.service";
import { listTerms } from "@/modules/scheduling/scheduling.repository";
import { createCriteria, deleteCriteria, deletePeriod, recalculate, updateCriteria } from "./actions";

const TABS = [["xep-hang", "Xếp hạng"], ["tieu-chi", "Tiêu chí"], ["lich-su", "Lịch sử lớp"]] as const;
const MEDAL = ["bg-yellow-100 text-yellow-800", "bg-slate-200 text-slate-700", "bg-orange-100 text-orange-800"];

type SP = { tab?: string; term?: string; period?: string; grade?: string; class?: string; v?: string };

export default async function Emulation({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const canEdit = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const sp = await searchParams;
  const tab = sp.tab === "tieu-chi" ? "tieu-chi" : sp.tab === "lich-su" ? "lich-su" : "xep-hang";
  const view = pickView(sp.v, "table");
  const isAdmin = me.roles.includes("ADMIN");
  const [terms, grades, classes] = await Promise.all([listTerms(), db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }), db.schoolClass.findMany({ orderBy: { className: "asc" }, include: { gradeLevel: true } })]);
  const term = terms.find((t) => t.id === sp.term) ?? terms[0] ?? null;

  const sumBtn = (term ? (<DialogButton label="Tổng hợp thi đua" title="Tổng hợp điểm thi đua">
          <ActionForm action={recalculate} submit="Tổng hợp" className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>button]:sm:col-span-2">
            <div className="sm:col-span-2"><Field label="Tên kỳ thi đua (vd: Tuần 1, Tháng 9, Học kỳ 1)"><input name="label" required className={inputCls + " w-full"} /></Field></div>
            <Field label="Học kỳ"><SearchableSelect name="termId" defaultValue={term.id} ariaLabel="Học kỳ" className="w-full" options={terms.map((t) => ({ value: t.id, label: `${t.termName} · ${t.academicYear.yearName}` }))} /></Field>
            <Field label="Lớp"><SearchableSelect name="classId" emptyLabel="Tất cả lớp" className="w-full" options={classes.map((c) => ({ value: c.id, label: c.className }))} /></Field>
            <Field label="Từ ngày (tuỳ chọn)"><input type="date" name="from" className={inputCls + " w-full"} /></Field>
            <Field label="Đến ngày (tuỳ chọn)"><input type="date" name="to" className={inputCls + " w-full"} /></Field>
            <p className="text-xs text-slate-500 sm:col-span-2">Bỏ trống ngày để tính theo toàn bộ sổ đầu bài. Điểm = điểm học tập TB × 10 − lượt vắng × 0,5 − số tiết chưa xếp loại Tốt × 1.</p>
          </ActionForm>
        </DialogButton>) : null);
  return (
    <div className="space-y-4">
      <Title right={canEdit ? sumBtn : undefined}>Thi đua</Title>
      <Tabs current={`?tab=${tab}`} items={TABS.map(([k, l]) => [`?tab=${k}`, l] as [string, string])} />

      {/* ===================== XẾP HẠNG ===================== */}
      {tab === "xep-hang" && await (async () => {
        if (!term) return <Card className="text-sm text-slate-500">Chưa có học kỳ nào. Tạo học kỳ ở mục Cấu hình trước.</Card>;
        const periods = (await db.classEmulationScore.findMany({ where: { academicTermId: term.id }, distinct: ["periodLabel"], select: { periodLabel: true }, orderBy: { periodLabel: "desc" } })).map((p) => p.periodLabel);
        const period = periods.includes(sp.period ?? "") ? sp.period! : periods[0] ?? "";
        const rows = period ? await db.classEmulationScore.findMany({
          where: { academicTermId: term.id, periodLabel: period, ...(sp.grade ? { schoolClass: { gradeLevelId: sp.grade } } : {}) },
          orderBy: [{ rank: "asc" }, { totalScore: "desc" }],
          include: { schoolClass: { include: { gradeLevel: true, homeroomTeacher: true } } },
        }) : [];
        // Thành phần điểm tính lại bằng đúng công thức + đúng khoảng ngày ghi trong nhãn kỳ.
        const range = parsePeriodRange(period);
        const parts = await Promise.all(rows.map((r) => computeEmulation(r.schoolClassId, term.id, range)));
        const best = rows[0], worst = rows[rows.length - 1];
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
            <AutoForm className="flex min-w-0 w-full flex-1 flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="xep-hang" />

              <select name="period" defaultValue={period} className={inputCls + " min-w-0 flex-1 md:min-w-56 md:flex-none"} aria-label="Kỳ thi đua">{periods.length ? periods.map((p) => <option key={p} value={p}>{p}</option>) : <option value="">Chưa có kỳ nào</option>}</select>
              <MobileCollapse active={[sp.grade, sp.term].filter(Boolean).length}>
              <SearchableSelect key={term.id} name="term" defaultValue={term.id} ariaLabel="Học kỳ" className="w-full md:w-52" options={terms.map((t) => ({ value: t.id, label: `${t.termName} · ${t.academicYear.yearName}` }))} />
                <SearchableSelect key={sp.grade ?? ""} name="grade" defaultValue={sp.grade ?? ""} emptyLabel="Tất cả khối" ariaLabel="Khối" className="w-full md:w-44" options={grades.map((g) => ({ value: g.id, label: g.gradeName }))} />
                {sp.grade && <Link href={`/thi-dua?tab=xep-hang&term=${term.id}&period=${encodeURIComponent(period)}`} className="inline-flex h-9 items-center rounded-md px-2 text-sm text-slate-500 hover:text-orange-700">Xoá lọc</Link>}
                <ViewToggle path="/thi-dua" params={{ tab: "xep-hang", term: term.id, period, grade: sp.grade }} view={view} />
              </MobileCollapse>

            </AutoForm>
            {isAdmin && period && <ToolbarActions label="Thao tác kỳ thi đua">
                <ActionForm action={deletePeriod} submit="Xoá kỳ này" danger compact confirmText={`Xoá toàn bộ kết quả của kỳ "${period}"?`} className="inline-flex"><input type="hidden" name="termId" value={term.id} /><input type="hidden" name="label" value={period} /></ActionForm>
              </ToolbarActions>}

            </div>

            {rows.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
                <Card><div className="flex items-center gap-2 text-xs text-gray-500"><Users className="size-4" />Số lớp xếp hạng</div><div className="text-2xl font-bold sm:text-3xl">{rows.length}</div></Card>
                <Card><div className="flex items-center gap-2 text-xs text-gray-500"><Trophy className="size-4" />Dẫn đầu</div><div className="truncate text-xl font-bold sm:text-2xl">{best.schoolClass.className}</div><div className="text-xs text-gray-500">{best.totalScore} điểm</div></Card>
                <Card><div className="flex items-center gap-2 text-xs text-gray-500"><TrendingDown className="size-4" />Cuối bảng</div><div className="truncate text-xl font-bold sm:text-2xl">{worst.schoolClass.className}</div><div className="text-xs text-gray-500">{worst.totalScore} điểm</div></Card>
                <Card><div className="flex items-center gap-2 text-xs text-gray-500"><Medal className="size-4" />Điểm trung bình</div><div className="text-2xl font-bold sm:text-3xl">{(rows.reduce((s, r) => s + r.totalScore, 0) / rows.length).toFixed(1)}</div></Card>
              </div>
            )}

            {view === "cards" ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {rows.map((r, i) => (
                  <Link key={r.id} href={`/thi-dua?tab=lich-su&class=${r.schoolClassId}`}>
                    <Card className="flex h-full flex-col gap-3 transition-colors hover:border-orange-400">
                      <div className="flex items-center gap-3">
                        <span className={`grid size-10 place-items-center rounded-lg text-base font-bold ${MEDAL[i] ?? "bg-orange-100 text-orange-700"}`}>{r.rank ?? i + 1}</span>
                        <div><div className="text-base font-semibold leading-tight">{r.schoolClass.className}</div><div className="text-xs text-slate-500">{r.schoolClass.gradeLevel.gradeName} · GVCN {r.schoolClass.homeroomTeacher?.fullName ?? "-"}</div></div>
                        <div className="ml-auto text-right"><div className="text-xl font-bold tabular-nums">{r.totalScore}</div><div className="text-[11px] text-slate-500">điểm</div></div>
                      </div>
                      <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-3 text-sm">
                        <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Học tập</dt><dd className="font-semibold">{parts[i].academicAverage.toFixed(2)}</dd></div>
                        <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Lượt vắng</dt><dd className="font-semibold">{parts[i].totalAbsences}</dd></div>
                        <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">Tiết chưa tốt</dt><dd className="font-semibold">{parts[i].nonTotCount}</dd></div>
                      </dl>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Table head={["Hạng", "Lớp", "GVCN", "Học tập (TB)", "Lượt vắng", "Tiết chưa tốt", "Điểm thi đua"]}>
                {rows.map((r, i) => (
                  <tr key={r.id} className="align-middle [&>td]:!py-3">
                    <td><span className={`inline-grid size-8 place-items-center rounded-lg text-sm font-bold ${MEDAL[i] ?? "bg-orange-100 text-orange-700"}`}>{r.rank ?? i + 1}</span></td>
                    <td><Link data-row href={`/thi-dua?tab=lich-su&class=${r.schoolClassId}`} className="font-semibold text-orange-700 hover:underline">{r.schoolClass.className}</Link><div className="text-xs text-slate-500">{r.schoolClass.gradeLevel.gradeName}</div></td>
                    <td>{r.schoolClass.homeroomTeacher?.fullName ?? <span className="text-slate-400">-</span>}</td>
                    <td className="tabular-nums">{parts[i].academicAverage.toFixed(2)}</td>
                    <td className="tabular-nums">{parts[i].totalAbsences}</td>
                    <td className="tabular-nums">{parts[i].nonTotCount}</td>
                    <td className="text-base font-bold tabular-nums">{r.totalScore}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">{period ? "Không có lớp nào trong bộ lọc." : "Chưa có kỳ thi đua nào. Bấm “Tổng hợp thi đua” để tạo kỳ đầu tiên."}</td></tr>}
              </Table>
            )}
          </div>
        );
      })()}

      {/* ===================== TIÊU CHÍ ===================== */}
      {tab === "tieu-chi" && await (async () => {
        const criteria = await db.emulationCriteria.findMany({ orderBy: { criteriaName: "asc" } });
        return (
          <div className="space-y-3">
            <Card className="space-y-1 text-sm">
              <h2 className="font-semibold">Công thức tính điểm hiện hành</h2>
              <p className="text-slate-600">Điểm thi đua = <b>điểm học tập trung bình lớp × 10</b> − <b>số lượt vắng × 0,5</b> − <b>số tiết không xếp loại Tốt × 1</b>. Dữ liệu lấy từ bảng điểm và sổ đầu bài. Tiêu đề và trọng số bên dưới là danh mục tiêu chí nhà trường quy định để tham chiếu.</p>
            </Card>
            {canEdit && (
            <div className="flex justify-end">
              <DialogButton label="+ Thêm tiêu chí" title="Thêm tiêu chí thi đua">
                <ActionForm action={createCriteria} submit="Thêm tiêu chí" className="flex flex-col gap-3 [&>button]:self-start">
                  <Field label="Tên tiêu chí"><input name="name" required className={inputCls + " w-full"} /></Field>
                  <Field label="Trọng số"><input name="weight" defaultValue="1" required className={inputCls + " w-full"} /></Field>
                </ActionForm>
              </DialogButton>
            </div>
            )}
            <Table head={["Tiêu chí", "Trọng số", ""]}>
              {criteria.map((c) => (
                <tr key={c.id} className="align-middle">
                  <td className="font-medium">{c.criteriaName}</td>
                  <td className="tabular-nums">{c.weight}</td>
                  <td>
                    {canEdit && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <DialogButton label="Sửa" title="Sửa tiêu chí" size="sm" variant="secondary">
                        <ActionForm action={updateCriteria} submit="Lưu" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
                          <input type="hidden" name="id" value={c.id} />
                          <Field label="Tên tiêu chí"><input name="name" defaultValue={c.criteriaName} required className={inputCls + " w-full"} /></Field>
                          <Field label="Trọng số"><input name="weight" defaultValue={c.weight} required className={inputCls + " w-full"} /></Field>
                        </ActionForm>
                      </DialogButton>
                      {isAdmin && <ActionForm action={deleteCriteria} submit="Xoá" danger compact confirmText={`Xoá tiêu chí "${c.criteriaName}"?`} className="inline-flex"><input type="hidden" name="id" value={c.id} /></ActionForm>}
                    </div>
                    )}
                  </td>
                </tr>
              ))}
              {!criteria.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Chưa có tiêu chí nào.</td></tr>}
            </Table>
          </div>
        );
      })()}

      {/* ===================== LỊCH SỬ LỚP ===================== */}
      {tab === "lich-su" && await (async () => {
        const classId = classes.some((c) => c.id === sp.class) ? sp.class! : classes[0]?.id ?? "";
        const cls = classes.find((c) => c.id === classId);
        const history = classId ? await db.classEmulationScore.findMany({ where: { schoolClassId: classId }, include: { academicTerm: { include: { academicYear: true } } }, orderBy: [{ academicTerm: { startDate: "asc" } }, { periodLabel: "asc" }] }) : [];
        const parts = await Promise.all(history.map((h) => computeEmulation(classId, h.academicTermId, parsePeriodRange(h.periodLabel))));
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
            <AutoForm className="flex min-w-0 w-full flex-1 flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="lich-su" />
              <SearchableSelect key={classId} name="class" defaultValue={classId} ariaLabel="Lớp" className="min-w-0 flex-1 md:min-w-56 md:flex-none" options={classes.map((c) => ({ value: c.id, label: c.className }))} />
            </AutoForm>

            </div>
            {cls && <h2 className="font-semibold">Lịch sử thi đua lớp {cls.className} <span className="text-sm font-normal text-slate-500">· {cls.gradeLevel.gradeName}</span></h2>}
            {history.length > 0 && <Card className="space-y-2"><h3 className="text-sm font-semibold">Điểm thi đua qua các kỳ</h3><ColumnChart items={history.map((h) => ({ label: h.periodLabel.replace(/\s*\(.*\)$/, ""), value: Math.max(0, Math.round(h.totalScore)) }))} /></Card>}
            <Table head={["Kỳ", "Học kỳ", "Học tập (TB)", "Lượt vắng", "Tiết chưa tốt", "Điểm", "Hạng"]}>
              {history.map((h, i) => (
                <tr key={h.id} className="align-middle">
                  <td className="font-medium">{h.periodLabel}</td>
                  <td>{h.academicTerm.termName} · {h.academicTerm.academicYear.yearName}</td>
                  <td className="tabular-nums">{parts[i].academicAverage.toFixed(2)}</td>
                  <td className="tabular-nums">{parts[i].totalAbsences}</td>
                  <td className="tabular-nums">{parts[i].nonTotCount}</td>
                  <td className="font-bold tabular-nums">{h.totalScore}</td>
                  <td>{h.rank ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MEDAL[h.rank - 1] ?? "bg-orange-100 text-orange-800"}`}>Hạng {h.rank}</span> : "-"}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Lớp này chưa có kết quả thi đua nào.</td></tr>}
            </Table>
          </div>
        );
      })()}
    </div>
  );
}
