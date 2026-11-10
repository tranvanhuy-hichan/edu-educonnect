import Link from "next/link";
import { Crown } from "lucide-react";
import { hueOf } from "@/components/schedule-chips";

type C = {
  id: string; className: string;
  shift?: "MORNING" | "AFTERNOON";
  room?: { roomName: string } | null;
  gradeLevel: { gradeName: string }; homeroomTeacher: { fullName: string } | null; academicYear: { yearName: string };
  monitor: { fullName: string } | null;
};

/** Thẻ lớp học gọn: dùng cho danh sách trên điện thoại và chế độ "Thẻ". Cả thẻ là một liên kết. */
export function ClassCard({ c, students }: { c: C; students: number }) {
  return (
    <Link href={`/lop-hoc/${c.id}`} className="block rounded-xl border bg-white p-3.5 shadow-sm transition-colors hover:border-orange-400 active:bg-slate-50" style={{ borderLeft: `4px solid hsl(${hueOf(c.id)} 65% 45%)` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="text-base font-semibold leading-snug">{c.className}</div>
          {c.shift === "AFTERNOON" ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Chiều</span>
          ) : (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">Sáng</span>
          )}
          {c.room && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">{c.room.roomName}</span>}
        </div>
        <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">{students} học sinh</span>
      </div>
      <div className="mt-0.5 text-[13px] text-slate-600">{c.gradeLevel.gradeName} · {c.academicYear.yearName}</div>
      <dl className="mt-3 grid grid-cols-2 gap-4 border-t pt-3 text-sm">
        <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-slate-500">GVCN</dt><dd className="truncate font-semibold">{c.homeroomTeacher?.fullName ?? <span className="font-normal text-slate-400">Chưa có</span>}</dd></div>
        <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-slate-500">Lớp trưởng</dt><dd className="truncate font-semibold">{c.monitor ? <span className="inline-flex items-center gap-1"><Crown className="size-3.5 text-orange-600" />{c.monitor.fullName}</span> : <span className="font-normal text-slate-400">Chưa chọn</span>}</dd></div>
      </dl>
    </Link>
  );
}
