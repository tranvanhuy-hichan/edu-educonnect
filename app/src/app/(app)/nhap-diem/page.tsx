import { termIsLocked } from "@/modules/scoring/locking";
import Link from "next/link";
import { AutoForm } from "@/components/auto-form";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { MobileCollapse } from "@/components/mobile-collapse";
import { BarChart3, ChevronRight, ClipboardCheck, Percent, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { Card, inputCls, Table, Tabs, Title } from "@/components/ui";
import { ViewToggle } from "@/components/view-toggle";
import { Pagination } from "@/components/pagination";
import { BarList, ColumnChart, Donut } from "@/components/charts";
import { getPaging } from "@/lib/paging";
import { BANDS, bandOf, gradeStats, type AssignmentStat } from "@/server/grades-stats";
import { assignmentWhere, termOptions } from "@/server/learning-scope";
import { toggleLockTerm } from "./actions";

const TABS = [["classes", "Danh sách lớp"], ["stats", "Thống kê"]] as const;
const fmt = (n: number | null, d = 1) => (n == null ? "-" : n.toFixed(d));

export default async function GradeEntry({ searchParams }: { searchParams: Promise<{ v?: string; tab?: string; q?: string; termId?: string; subjectId?: string; classId?: string; all?: string; page?: string; size?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const sp = await searchParams;
  const tab = sp.tab === "stats" ? "stats" : "classes";
  const view = sp.v === "table" ? "table" : "cards";
  const pg = getPaging(sp, 12);

  // giáo viên chỉ thấy lớp-môn mình phụ trách
  const scope = assignmentWhere(me);
  const [terms, subjects] = await Promise.all([termOptions(), db.subject.findMany({ orderBy: { subjectName: "asc" } })]);
  const stats = await gradeStats({
    where: scope, termId: sp.termId || undefined, subjectId: sp.subjectId || undefined,
    q: tab === "classes" ? sp.q : undefined, includePast: !!sp.all || tab === "stats",
  });

  const isManager = me.roles.some((r) => (MANAGER_ROLES as readonly string[]).includes(r));
  const lockManageBtn = isManager ? (
    <DialogButton label="🔒 Khóa sổ điểm" title="Quản lý khóa sổ điểm các học kỳ" variant="secondary">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Khi khóa sổ điểm, giáo viên bộ môn sẽ không thể sửa đổi điểm. Hệ thống cũng tự động khóa sau khi học kỳ kết thúc quá 15 ngày (chỉ Ban Giám hiệu mới có quyền mở khóa).
        </p>
        <div className="divide-y rounded-lg border bg-white">
          {terms.map((t) => {
            const isPast15 = termIsLocked({ ...t, isLocked: false });
            return (
              <div key={t.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-semibold">{t.termName} · {t.yearName}</div>
                  <div className="text-xs text-slate-500">
                    {t.isLocked ? (
                      <span className="font-medium text-amber-700">Đã khóa thủ công bởi {t.lockedBy || "BGH"}</span>
                    ) : isPast15 ? (
                      <span className="font-medium text-slate-500">Tự động khóa (&gt;15 ngày kết thúc)</span>
                    ) : (
                      <span className="font-medium text-green-700">Đang mở cho giáo viên nhập điểm</span>
                    )}
                  </div>
                </div>
                <ActionForm action={toggleLockTerm} submit="Khóa sổ / thu hồi quyền sửa" className="inline" reset={false}>
                  <input type="hidden" name="termId" value={t.id} />
                  <input type="hidden" name="lock" value="true" />
                </ActionForm>
              </div>
            );
          })}
        </div>
      </div>
    </DialogButton>
  ) : null;

  return (
    <div className="space-y-4">
      <Title right={lockManageBtn}>Nhập điểm</Title>
      <Tabs current={`?tab=${tab}`} items={TABS.map(([k, l]) => [`?tab=${k}`, l] as [string, string])} />

      {/* ===================== DANH SÁCH LỚP ===================== */}
      {tab === "classes" && (() => {
        const total = stats.length;
        const page = stats.slice(pg.skip, pg.skip + pg.take);
        return (
          <div className="space-y-3">
            <AutoForm className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="classes" /><input type="hidden" name="v" value={view} />
              <input name="q" defaultValue={sp.q} placeholder="Tìm lớp, môn..." className={inputCls + " min-w-0 flex-1 md:min-w-48"} />
              <MobileCollapse active={[sp.termId, sp.subjectId, sp.all].filter(Boolean).length}>
                <select name="termId" defaultValue={sp.termId ?? ""} className={inputCls}><option value="">Tất cả học kỳ</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
                <select name="subjectId" defaultValue={sp.subjectId ?? ""} className={inputCls}><option value="">Tất cả môn</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.subjectName}</option>)}</select>
                <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border bg-white px-3 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50"><input type="checkbox" name="all" value="1" defaultChecked={!!sp.all} /> Gồm học kỳ đã kết thúc</label>
              </MobileCollapse>
              <div className="hidden md:block"><ViewToggle path="/nhap-diem" params={{ tab: "classes", q: sp.q, termId: sp.termId, subjectId: sp.subjectId, all: sp.all, size: sp.size }} view={view} /></div>
            </AutoForm>
            {/* Điện thoại: thẻ lớp-môn gọn thay cho bảng */}
            <div className={view === "cards" ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "space-y-2 md:hidden"}>
              {page.map((c) => {
                const pct = c.expected ? Math.round((c.filled / c.expected) * 100) : 0;
                const band = c.avgNorm != null ? bandOf(c.avgNorm) : null;
                const href = `/nhap-diem/${c.id}`;
                return (
                  <Link key={c.id} href={href} className="block rounded-xl border bg-white p-3.5 shadow-sm transition-colors active:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="font-semibold leading-snug">{c.className} · {c.subjectName}</div><div className="text-xs text-slate-500">GV: {c.teacher ?? "-"}{c.finished ? " · Đã kết thúc" : ""} · {c.students} học sinh</div></div>
                      <span className="shrink-0 rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">{c.termName}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4 border-t pt-3">
                      <div className="min-w-0">
                        <div className="flex justify-between text-xs"><span className="text-slate-500">Đã nhập</span><b>{pct}%</b></div>
                        <div className="mt-0.5 text-sm"><b>{c.filled}</b><span className="text-slate-500">/{c.expected} ô</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "var(--color-orange-500)" }} /></div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">{c.assessmentType === "COMMENT" ? "Đánh giá bằng nhận xét" : "Điểm TB (thang 10)"}</div>
                        {band ? <div className="mt-0.5 font-semibold" style={{ color: band.color }}>{fmt(c.avgNorm, 2)} <span className="text-xs font-normal text-slate-500">· {band.label}</span></div> : <div className="mt-0.5 text-slate-400">—</div>}
                      </div>
                    </div>
                  </Link>
                );
              })}
              {!page.length && <p className="py-8 text-center text-sm text-slate-500">Không có lớp nào.</p>}
            </div>
            <div className={view === "cards" ? "hidden" : "hidden md:block"}><Table head={["Lớp · môn", "Học sinh", "Tiến độ nhập điểm", "Điểm TB (thang 10)", ""]}>
              {page.map((c) => {
                const pct = c.expected ? Math.round((c.filled / c.expected) * 100) : 0;
                const band = c.avgNorm != null ? bandOf(c.avgNorm) : null;
                const href = `/nhap-diem/${c.id}`;
                return (
                  <tr key={c.id} className="align-middle [&>td]:!py-3">
                    <td className="w-[36%] min-w-56"><Link data-row href={href} className="block font-semibold hover:text-orange-700">{c.className} <span className="mx-1 font-normal text-slate-400">·</span> <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">{c.subjectName}</span></Link><div className="mt-0.5 text-xs text-slate-500">GV: {c.teacher ?? "-"} · {c.termName}{c.finished ? " · Đã kết thúc" : ""}</div></td>
                    <td className="w-[9%]">{c.students}</td>
                    <td className="w-[28%] min-w-44">
                      <div className="flex justify-between text-xs"><span>{c.filled}/{c.expected} ô</span><b>{pct}%</b></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "var(--color-orange-500)" }} /></div>
                    </td>
                    <td className="w-[20%]"><div className="flex items-center">{band ? <span className="font-semibold" style={{ color: band.color }}>{fmt(c.avgNorm, 2)} <span className="text-xs font-normal text-slate-500">· {band.label}</span></span> : <span className="text-slate-400">—</span>}</div></td>
                    <td className="w-8"><div className="flex justify-end"><ChevronRight className="size-4 shrink-0 text-slate-400" /></div></td>
                  </tr>
                );
              })}
              {!page.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Không có lớp nào.</td></tr>}
            </Table></div>
            <Pagination total={total} page={pg.page} size={pg.size} path="/nhap-diem" params={{ tab: "classes", v: sp.v, q: sp.q, termId: sp.termId, subjectId: sp.subjectId, all: sp.all, size: sp.size }} />
          </div>
        );
      })()}

      {/* ===================== THỐNG KÊ ===================== */}
      {tab === "stats" && (() => {
        const scopeStats: AssignmentStat[] = sp.classId ? stats.filter((c) => c.schoolClassId === sp.classId) : stats;
        const rows = scopeStats.flatMap((c) => c.rows.filter((r) => r.norm != null).map((r) => ({ ...r, cls: `${c.className} · ${c.subjectName}` })));
        const filled = scopeStats.reduce((a, c) => a + c.filled, 0), expected = scopeStats.reduce((a, c) => a + c.expected, 0);
        const avg = rows.length ? rows.reduce((a, r) => a + r.norm!, 0) / rows.length : null;
        const bands = BANDS.map((b) => ({ label: b.label, color: b.color, value: rows.filter((r) => bandOf(r.norm!).key === b.key).length }));
        const bins = Array.from({ length: 10 }, (_, i) => ({ label: `${i}–${i + 1}`, value: rows.filter((r) => (i === 9 ? r.norm! >= 9 : r.norm! >= i && r.norm! < i + 1)).length, color: bandOf(i + 0.5).color }));
        const byClass = [...scopeStats].filter((c) => c.avgNorm != null).sort((a, b) => b.avgNorm! - a.avgNorm!);
        const top = [...rows].sort((a, b) => b.norm! - a.norm!).slice(0, 8);
        const low = [...rows].filter((r) => r.norm! < 5).sort((a, b) => a.norm! - b.norm!).slice(0, 8);
        const classes = [...new Map(stats.map((c) => [c.schoolClassId, c.className])).entries()];
        // một lớp-môn cụ thể: hiện điểm TB từng nhóm cột (thường xuyên / giữa kỳ / cuối kỳ)
        const one = sp.classId && sp.subjectId && scopeStats.length === 1 ? scopeStats[0] : null;

        const Stat = ({ icon: I, label, value, tone = "bg-orange-100 text-orange-700" }: { icon: typeof Users; label: string; value: React.ReactNode; tone?: string }) => (
          <Card className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}><I className="size-4 sm:size-5" /></span><div className="min-w-0"><div className="text-xs leading-tight text-slate-500">{label}</div><div className="truncate text-lg font-bold sm:text-xl">{value}</div></div></Card>
        );
        return (
          <div className="space-y-4">
            <AutoForm className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="stats" />
              <MobileCollapse active={[sp.classId, sp.termId, sp.subjectId].filter(Boolean).length}>
                <select name="classId" defaultValue={sp.classId ?? ""} className={inputCls}><option value="">Tất cả lớp</option>{classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
                <select name="termId" defaultValue={sp.termId ?? ""} className={inputCls}><option value="">Tất cả học kỳ</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
                <select name="subjectId" defaultValue={sp.subjectId ?? ""} className={inputCls}><option value="">Tất cả môn</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.subjectName}</option>)}</select>
              </MobileCollapse>
            </AutoForm>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat icon={ClipboardCheck} label="Lớp-môn có điểm" value={scopeStats.filter((c) => c.graded > 0).length} />
              <Stat icon={Users} label="Học sinh đã có điểm" value={rows.length} tone="bg-sky-100 text-sky-700" />
              <Stat icon={BarChart3} label="Điểm trung bình (thang 10)" value={fmt(avg, 2)} tone="bg-green-100 text-green-700" />
              <Stat icon={Percent} label="Tiến độ nhập điểm" value={expected ? `${Math.round((filled / expected) * 100)}%` : "-"} tone="bg-yellow-100 text-yellow-700" />
            </div>

            {!rows.length ? <Card className="py-10 text-center text-sm text-slate-500">Chưa có dữ liệu điểm để thống kê.</Card> : (
              <>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card><h2 className="mb-4 font-semibold">Phân bố xếp loại</h2><Donut items={bands} center={<div><div className="text-2xl font-bold">{rows.length}</div><div className="text-xs text-slate-500">học sinh</div></div>} /></Card>
                  <Card><h2 className="mb-4 font-semibold">Phân bố điểm trung bình (thang 10)</h2><ColumnChart items={bins} /></Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {one ? (
                    <Card><h2 className="mb-4 font-semibold">Điểm trung bình từng nhóm cột — {one.className} · {one.subjectName}</h2>
                      <BarList max={10} items={one.cats.filter((c) => c.avg != null).map((c) => ({ label: c.name, value: c.avg!, hint: `(${c.filled} điểm)`, color: bandOf(c.avg!).color }))} />
                      <p className="mt-2 text-xs text-slate-500">Điểm các nhóm cột đều trên thang 10.</p></Card>
                  ) : (
                    <Card><h2 className="mb-4 font-semibold">Điểm trung bình theo lớp-môn</h2>
                      <BarList max={10} items={byClass.map((c) => ({ label: `${c.className} · ${c.subjectName}`, value: c.avgNorm!, color: bandOf(c.avgNorm!).color }))} /></Card>
                  )}
                  <Card><h2 className="mb-4 font-semibold">Tiến độ nhập điểm theo lớp-môn</h2>
                    <BarList max={100} unit="%" items={scopeStats.map((c) => ({ label: `${c.className} · ${c.subjectName}`, value: c.expected ? Math.round((c.filled / c.expected) * 100) : 0, color: c.expected && c.filled >= c.expected ? "#22c55e" : undefined }))} /></Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-0"><div className="border-b px-4 py-3"><h2 className="font-semibold">Điểm cao nhất</h2></div>
                    <ul className="divide-y text-sm">{top.map((r, i) => <li key={r.studentId + r.cls} className="flex items-center gap-3 px-4 py-2.5"><span className="w-5 text-slate-400">{i + 1}</span><div className="min-w-0 flex-1"><Link href={`/hoc-sinh/${r.studentId}`} className="font-medium hover:text-orange-700">{r.name}</Link><div className="text-xs text-slate-500">{r.cls}</div></div><b style={{ color: bandOf(r.norm!).color }}>{fmt(r.norm, 2)}</b></li>)}</ul></Card>
                  <Card className="p-0"><div className="border-b px-4 py-3"><h2 className="font-semibold">Cần chú ý (dưới 5 điểm)</h2></div>
                    <ul className="divide-y text-sm">{low.map((r) => <li key={r.studentId + r.cls} className="flex items-center gap-3 px-4 py-2.5"><div className="min-w-0 flex-1"><Link href={`/hoc-sinh/${r.studentId}`} className="font-medium hover:text-orange-700">{r.name}</Link><div className="text-xs text-slate-500">{r.cls}</div></div><b className="text-red-600">{fmt(r.norm, 2)}</b></li>)}
                      {!low.length && <li className="px-4 py-8 text-center text-slate-500">Không có học sinh nào dưới 5 điểm.</li>}</ul></Card>
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
