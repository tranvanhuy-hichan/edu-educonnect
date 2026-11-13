import Link from "next/link";
import { AlertTriangle, DoorOpen, School } from "lucide-react";

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
    <Link href={`/lop-hoc/${c.id}`} className="sample-class-card sample-surface block p-3 transition-colors md:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="sample-brand-icon grid size-8 shrink-0 place-items-center rounded-lg"><School className="size-4" /></span>
          <div className="min-w-0"><h2 className="break-words text-base font-semibold leading-snug">{c.className}</h2><p className="sample-muted mt-0.5 text-xs">{c.gradeLevel.gradeName} · {c.academicYear.yearName}</p></div>
        </div>
        <div className="shrink-0 text-right"><p className="text-xl font-semibold leading-none tabular-nums">{students}</p><p className="sample-muted mt-1 text-[11px]">học sinh</p></div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="sample-info rounded px-1.5 py-0.5">{c.shift === "AFTERNOON" ? "Ca chiều" : "Ca sáng"}</span>
        <span className="sample-muted inline-flex items-center gap-1"><DoorOpen className="size-3.5" />{c.room?.roomName ?? "Chưa có phòng"}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-x-3 border-t pt-2.5 md:grid-cols-2">
        <div className="min-w-0">
          <p className="sample-muted text-[11px]">Giáo viên chủ nhiệm</p>
          {c.homeroomTeacher ? <p className="mt-0.5 line-clamp-2 text-[13px] font-medium">{c.homeroomTeacher.fullName}</p> : <p className="sample-warning mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"><AlertTriangle className="size-3" />Chưa phân công GVCN</p>}
        </div>
        <div className="hidden min-w-0 md:block">
          <p className="sample-muted text-[11px]">Lớp trưởng</p>
          <p className={`mt-0.5 line-clamp-2 text-[13px] ${c.monitor ? "font-medium" : "sample-muted"}`}>{c.monitor?.fullName ?? "Chưa chọn"}</p>
        </div>
      </div>
    </Link>
  );
}
