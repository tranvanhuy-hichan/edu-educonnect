import Link from "next/link";
import { Atom, BookOpen, BookText, ChevronRight, Dna, FlaskConical, Globe2, Landmark, Languages, Laptop, Sigma, type LucideIcon } from "lucide-react";

/** Biểu tượng + màu theo môn học (tra theo tên, không phân biệt dấu/hoa thường). */
const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
const SUBJECTS: [RegExp, LucideIcon, string][] = [
  [/toan/, Sigma, "bg-blue-100 text-blue-700"],
  [/vat ly|vat li/, Atom, "bg-purple-100 text-purple-700"],
  [/hoa/, FlaskConical, "bg-green-100 text-green-800"],
  [/sinh/, Dna, "bg-emerald-100 text-emerald-800"],
  [/ngu van|van/, BookText, "bg-red-100 text-red-700"],
  [/anh|ngoai ngu/, Languages, "bg-yellow-100 text-yellow-800"],
  [/lich su/, Landmark, "bg-orange-100 text-orange-700"],
  [/dia/, Globe2, "bg-cyan-100 text-cyan-800"],
  [/tin/, Laptop, "bg-slate-200 text-slate-700"],
];
export function subjectVisual(name: string): { icon: LucideIcon; tone: string } {
  const n = norm(name);
  const hit = SUBJECTS.find(([re]) => re.test(n));
  return hit ? { icon: hit[1], tone: hit[2] } : { icon: BookOpen, tone: "bg-orange-100 text-orange-700" };
}

export type DrillItem = {
  href: string; title: string; icon: LucideIcon; tone?: string;
  /** Số liệu hiển thị dưới tên, vd { value: 3, label: "lớp" }. Số 0 hiện mờ. */
  stats: { value: number | string; label: string }[];
  note?: string; // dòng phụ (vd tên giáo viên)
  chips?: string[]; // nhãn nhỏ (vd học kỳ)
  emptyHint?: string; // hiện khi mọi số liệu đều bằng 0
};

export function DrillGrid({ items, cols = 3 }: { items: DrillItem[]; cols?: 2 | 3 }) {
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : ""}`}>
      {items.map((it) => {
        const empty = it.stats.every((s) => !Number(s.value));
        return (
          <Link key={it.href} href={it.href} className="group item-card flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-400 hover:shadow-md">
            <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${it.tone ?? "bg-orange-100 text-orange-700"}`}><it.icon className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold">{it.title}</span>
              {empty && it.emptyHint ? <span className="mt-1 block text-xs text-slate-400">{it.emptyHint}</span> : (
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  {it.stats.map((s) => <span key={s.label} className={Number(s.value) ? "" : "opacity-50"}><b className="font-semibold text-slate-700">{s.value}</b> {s.label}</span>)}
                </span>
              )}
              {it.note && <span className="mt-1 block truncate text-xs text-slate-500">{it.note}</span>}
              {!!it.chips?.length && <span className="mt-2 flex flex-wrap gap-1">{it.chips.map((c) => <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{c}</span>)}</span>}
            </span>
            <ChevronRight className="size-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-600" />
          </Link>
        );
      })}
    </div>
  );
}

/** Đầu trang chọn: tiêu đề, mô tả và dải số liệu tổng quan. */
export function DrillHeader({ icon: Icon, title, description, stats, tone = "bg-orange-100 text-orange-700", right }: {
  icon: LucideIcon; title: string; description?: string; stats?: { value: number | string; label: string }[]; tone?: string; right?: React.ReactNode;
}) {
  return (
    <div className="item-card rounded-xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${tone}`}><Icon className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
        </div>
        {right}
      </div>
      {!!stats?.length && (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-slate-50 px-3 py-2"><dt className="text-xs text-slate-500">{s.label}</dt><dd className="text-lg font-semibold tabular-nums">{s.value}</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
}

export type SubjectCardData = {
  id: string; name: string; summary: string;
  grades: { href: string; label: string; count: number; unit: string; disabled?: boolean }[];
};

/** Mỗi môn một thẻ, kèm sẵn các nút khối: bấm khối là vào thẳng danh sách, không qua trang chọn khối. */
export function SubjectGradeGrid({ items, emptyText }: { items: SubjectCardData[]; emptyText?: string }) {
  if (!items.length) return emptyText ? <div className="item-card rounded-lg border bg-white p-4 text-sm text-slate-600">{emptyText}</div> : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((s) => {
        const { icon: Icon, tone } = subjectVisual(s.name);
        return (
          <div key={s.id} className="item-card rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
              <div className="min-w-0 flex-1"><div className="truncate text-base font-semibold">{s.name}</div><div className="text-xs text-slate-500">{s.summary}</div></div>
            </div>
            <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(s.grades.length, 1), 4)}, minmax(0, 1fr))` }}>
              {s.grades.map((g) => {
                const body = <><span className="block text-sm font-semibold">{g.label}</span><span className="block text-[11px] text-slate-500">{g.count} {g.unit}</span></>;
                return g.disabled
                  ? <span key={g.label} aria-disabled className="cursor-not-allowed rounded-lg border border-dashed px-2 py-2 text-center opacity-45">{body}</span>
                  : <Link key={g.label} href={g.href} className="rounded-lg border bg-white px-2 py-2 text-center transition-colors hover:border-orange-400 hover:bg-orange-50">{body}</Link>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
