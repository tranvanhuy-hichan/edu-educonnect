import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Tone = "teal" | "sky" | "amber" | "violet" | "rose" | "emerald" | "slate";
/** Màu nhãn môn học: chỉ họ màu lạnh để trang không bị rối. */
const SUBJECT_TONES: Tone[] = ["teal", "sky", "emerald", "slate"];

/** Màu ổn định cho một môn học: cùng tên môn luôn cùng màu ở mọi trang. */
export const toneOf = (key: string): Tone => SUBJECT_TONES[[...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % SUBJECT_TONES.length];

/** Lời chào theo giờ Việt Nam. */
export function greetingNow(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(now)) % 24;
  return h < 11 ? "Chào buổi sáng" : h < 13 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

/** Dải chào đầu trang: gradient theo màu chủ đạo, kèm thông tin ngày/học kỳ và các nút tắt theo vai trò. */
export function HeroBanner({ eyebrow, title, subtitle, chips = [], actions = [] }: {
  eyebrow?: string; title: string; subtitle?: string; chips?: React.ReactNode[]; actions?: { href: string; label: string; icon: LucideIcon }[];
}) {
  return (
    <header className="dashboard-hero relative overflow-hidden rounded-2xl px-4 py-5 shadow-sm sm:px-6 sm:py-6">
      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{eyebrow}</p>}
          <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-white/80">{subtitle}</p>}
          {chips.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">{chips.map((c, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-medium backdrop-blur-sm">{c}</span>)}</div>}
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-semibold shadow-sm transition hover:bg-white/90 active:scale-[0.98]" style={{ color: "var(--sidebar)" }}>
                <Icon className="size-4" />{label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

/** Thẻ chỉ số: nền pha màu nhạt, icon gradient, hơi nhấc lên khi rê chuột. */
export function StatTile({ icon: Icon, label, value, href, tone = "teal", sub, valueClass = "" }: {
  icon: LucideIcon; label: string; value: React.ReactNode; href: string; tone?: Tone; sub?: string; valueClass?: string;
}) {
  return (
    <Link href={href} className={`tone-${tone} tone-card group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border p-3 transition duration-200 hover:-translate-y-0.5 sm:p-4`}>
      <Icon aria-hidden="true" className="pointer-events-none absolute -bottom-3 -right-2 size-16 opacity-[0.07]" style={{ color: "var(--tone)" }} strokeWidth={1.5} />
      <span className="tone-chip grid size-10 shrink-0 place-items-center rounded-xl sm:size-11"><Icon className="size-5" strokeWidth={1.9} /></span>
      <div className="relative min-w-0">
        <div className="truncate text-xs font-medium text-slate-500 sm:text-[13px]">{label}</div>
        <div className={`truncate text-xl font-bold leading-tight tabular-nums sm:text-2xl ${valueClass}`}>{value}</div>
        {sub && <div className="truncate text-[11px] text-slate-500">{sub}</div>}
      </div>
    </Link>
  );
}

/** Ô truy cập nhanh theo nhóm chức năng. */
export function QuickTile({ icon: Icon, label, href, tone, hint }: { icon: LucideIcon; label: string; href: string; tone: Tone; hint?: string }) {
  return (
    <Link href={href} className={`tone-${tone} tone-card group flex items-center gap-3 rounded-xl border p-3 transition duration-200 hover:-translate-y-0.5 sm:p-3.5`}>
      <span className="tone-chip grid size-10 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-105"><Icon className="size-5" strokeWidth={1.9} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{label}</span>{hint && <span className="block truncate text-[11px] text-slate-500">{hint}</span>}</span>
      <ArrowUpRight className="size-4 shrink-0 text-slate-400 transition group-hover:text-[color:var(--tone)]" />
    </Link>
  );
}

export type TimelineSlot = { id: string; kind: string; periodNo: number; schoolClass: { className: string }; assignment: { subject: { subjectName: string }; teacher: { fullName: string } }; room: { roomName: string } };

/** Lịch trong ngày dạng dòng thời gian: mỗi tiết một bong bóng màu theo môn, nối bằng đường dọc. */
export function SubjectTimeline({ slots, action }: { slots: TimelineSlot[]; action?: (slot: TimelineSlot) => React.ReactNode }) {
  return (
    <ol className="relative px-4 py-3 sm:px-5">
      {slots.map((s, i) => {
        const tone = toneOf(s.assignment.subject.subjectName);
        return (
          <li key={s.id} className={`tone-${tone} relative flex gap-3 pb-4 last:pb-1 sm:gap-4`}>
            {i < slots.length - 1 && <span aria-hidden="true" className="absolute left-[1.05rem] top-9 h-[calc(100%-1.75rem)] w-px bg-[color:var(--line)]" />}
            <span className="tone-chip z-10 grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums" aria-label={`Tiết ${s.periodNo}`}>{s.periodNo}</span>
            <div className="tone-soft flex min-w-0 flex-1 flex-col gap-2 rounded-xl px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold sm:truncate">{s.assignment.subject.subjectName} <span className="font-normal opacity-80">· {s.schoolClass.className}</span></div>
                <div className="text-xs opacity-75 sm:truncate">{s.assignment.teacher.fullName} · Phòng {s.room.roomName}</div>
              </div>
              {action?.(s)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
