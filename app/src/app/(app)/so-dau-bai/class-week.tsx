import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { MANAGER_ROLES, type Role } from "@/lib/guard";
import { AutoForm } from "@/components/auto-form";
import { ActionMenu } from "@/components/action-menu";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Field, inputCls, Table } from "@/components/ui";
import { WEEKDAYS, addDays, fmtDate, isoDate, todayUTC } from "@/lib/format";
import { clampWeek, shortDate, weekCount, weekNumber, weekStart } from "@/lib/week";
import { TEACHER_EDIT_DAYS } from "@/modules/attendance/attendance.service";
import { saveLogPick } from "./actions";

export const RATING: Record<string, [string, string]> = { TOT: ["Tốt", "bg-green-100 text-green-800"], KHA: ["Khá", "bg-sky-100 text-sky-800"], TB: ["Trung bình", "bg-yellow-100 text-yellow-800"], YEU: ["Yếu", "bg-red-100 text-red-600"] };
export const GRADE_LETTER: Record<string, string> = { TOT: "A", KHA: "B", TB: "C", YEU: "D" };

type ClassLite = { id: string; className: string; academicYear: { id: string; yearName: string; startDate: Date; endDate: Date }; _count?: { enrollments: number } };

/**
 * Sổ đầu bài của MỘT lớp: Tuần → Ngày → Tiết. Dùng chung cho trang Sổ đầu bài và trang Lớp chủ nhiệm.
 * `base` là các tham số URL giữ nguyên khi đổi tuần (vd { tab: "diary", classId }); truyền `classes` để hiện ô chọn lớp (tên tham số "class").
 */
export async function ClassWeek({ me, cls, classes, teachers = [], w, fTeacher = "", base }: {
  me: { roles: Role[]; teacherId?: string | null }; cls: ClassLite; classes?: ClassLite[]; teachers?: { id: string; fullName: string }[]; w?: string; fTeacher?: string; base: Record<string, string>;
}) {
  const staff = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const today = todayUTC();
  const size = cls._count?.enrollments ?? (await db.studentClassEnrollment.count({ where: { schoolClassId: cls.id } }));
  const ownsSlot = (s: { assignment: { teacherId: string } }) => staff || (!!me.teacherId && s.assignment.teacherId === me.teacherId);
        const year = cls.academicYear;
        const total = weekCount(year.startDate, year.endDate);
        const curWeek = clampWeek(weekNumber(year.startDate, today), total);
        const wk = clampWeek(parseInt(w ?? "", 10) || curWeek, total);
        const monday = weekStart(year.startDate, wk);
        const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i)); // Thứ 2 … Thứ 7
        const slots = await db.timetableSlot.findMany({
          where: { ...effectiveSlots(monday), schoolClassId: cls.id, academicTerm: { academicYearId: year.id }, ...(fTeacher ? { assignment: { teacherId: fTeacher } } : {}) },
          orderBy: { periodNo: "asc" },
          include: { assignment: { include: { subject: true, teacher: true } }, room: true, academicTerm: true },
        });
        const logs = slots.length ? await db.classPeriodLog.findMany({ where: { timetableSlotId: { in: slots.map((s) => s.id) }, logDate: { gte: monday, lte: days[5] } } }) : [];
        const logOf = new Map(logs.map((l) => [`${l.timetableSlotId}|${isoDate(l.logDate)}`, l]));
        const link = (o: Record<string, string>) => `?${new URLSearchParams({ ...base, w: String(wk), ...(fTeacher ? { teacher: fTeacher } : {}), ...o })}`;
        const weeks = Array.from({ length: total }, (_, i) => i + 1);

        // Hộp "Ghi sổ": chọn tiết (nhóm theo ngày) rồi ghi — chỉ gồm tiết người dùng được phép ghi.
        const dayList = days.map((d, i) => ({ d, iso: isoDate(d), list: slots.filter((s) => s.dayOfWeek === i + 2 && s.academicTerm.startDate <= d && s.academicTerm.endDate >= d) }));
        const writable = (s: (typeof slots)[number], d: Date) => ownsSlot(s) && (staff || (d.getTime() <= today.getTime() && (today.getTime() - d.getTime()) / 86400_000 <= TEACHER_EDIT_DAYS));
        const pickable = dayList.map((x) => ({ ...x, list: x.list.filter((s) => writable(s, x.d)) })).filter((x) => x.list.length);
        const flat = pickable.flatMap((x) => x.list.map((s) => ({ s, iso: x.iso, d: x.d })));
        const first = flat.find((x) => !logOf.has(`${x.s.id}|${x.iso}`) && x.d.getTime() <= today.getTime()) ?? flat[0];

        const writeButton = first ? (
          <DialogButton label="Ghi sổ" title={`Ghi sổ đầu bài · ${cls.className} · Tuần ${wk}`}>
            <ActionForm action={saveLogPick} submit="Lưu sổ đầu bài" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
              <Field label="Tiết cần ghi">
                <select name="pick" defaultValue={`${first.s.id}|${first.iso}`} className={inputCls + " w-full"} required>
                  {pickable.map((x) => (
                    <optgroup key={x.iso} label={`${WEEKDAYS[x.d.getUTCDay()]} · ${fmtDate(x.d)}`}>
                      {x.list.map((s) => <option key={s.id} value={`${s.id}|${x.iso}`}>Tiết {s.periodNo} · {s.assignment.subject.subjectName} · {s.assignment.teacher.fullName}{logOf.has(`${s.id}|${x.iso}`) ? " (đã ghi — ghi lại sẽ cập nhật)" : ""}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label={`Số học sinh vắng (sĩ số ${size})`}><input type="number" name="absent" min={0} max={size} defaultValue={0} className={inputCls + " w-full"} /></Field>
              <Field label="Xếp loại tiết học"><select name="conductRating" defaultValue="" className={inputCls + " w-full"}><option value="">-- chưa xếp loại --</option>{Object.entries(RATING).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Nhận xét"><textarea name="note" rows={3} className={inputCls + " h-auto w-full py-2"} /></Field>
            </ActionForm>
          </DialogButton>

        ) : null;
        const weekFilters = <>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-500">Chọn tuần
            <select name="w" defaultValue={String(wk)} className={inputCls + " w-full min-w-0 xl:w-auto"} aria-label="Tuần">{weeks.map((n) => <option key={n} value={n}>Tuần {n} · {shortDate(weekStart(year.startDate, n))} – {shortDate(addDays(weekStart(year.startDate, n), 6))}</option>)}</select>
          </label>
          {staff && <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-500">Giáo viên
            <select name="teacher" defaultValue={fTeacher} className={inputCls + " w-full min-w-0 xl:w-auto"} aria-label="Giáo viên"><option value="">Tất cả giáo viên</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select>
          </label>}
        </>;

        return (
          <div className="space-y-3">
            <div className="diary-toolbar flex flex-col gap-2 xl:flex-row xl:items-end">
              <AutoForm className="grid w-full min-w-0 gap-2 xl:flex xl:flex-1 xl:flex-wrap xl:items-end">
                {Object.entries(base).filter(([k]) => k !== "class").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                {classes && <select name="class" defaultValue={cls.id} className={inputCls + " col-span-full w-full min-w-0 xl:w-auto"} aria-label="Lớp">{classes.map((c) => <option key={c.id} value={c.id}>{c.className} · {c.academicYear.yearName}</option>)}</select>}
                <div className="hidden md:contents">{weekFilters}</div>
              </AutoForm>
              <div className="diary-week-actions grid w-full grid-cols-[2.25rem_minmax(0,1fr)_2.25rem_2.25rem] items-center gap-2 text-sm md:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] xl:flex xl:w-auto xl:shrink-0">
                <Link className="inline-flex size-9 items-center justify-center rounded-md border bg-white hover:bg-slate-50" href={link({ w: String(clampWeek(wk - 1, total)) })} aria-label="Tuần trước"><ChevronLeft className="size-4" /></Link>
                <span className="min-w-0 whitespace-nowrap text-center font-medium">Tuần {wk}/{total}</span>
                <Link className="inline-flex size-9 items-center justify-center rounded-md border bg-white hover:bg-slate-50" href={link({ w: String(clampWeek(wk + 1, total)) })} aria-label="Tuần sau"><ChevronRight className="size-4" /></Link>
                <div className="md:hidden"><ActionMenu label="Tùy chọn sổ đầu bài" wide>
                  <Link className="flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-slate-50" href={link({ w: String(curWeek) })}>Về tuần này</Link>
                  <div className="[&>button]:w-full [&>button]:justify-start">{writeButton}</div>
                  <AutoForm className="menu-filter-form flex flex-col gap-3 border-t px-2 py-3">
                    {Object.entries(base).filter(([k]) => k !== "class").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                    {classes && <input type="hidden" name="class" value={cls.id} />}
                    {weekFilters}
                  </AutoForm>
                </ActionMenu></div>
                <div className="diary-buttons col-span-full hidden items-center gap-2 md:flex">
                  <Link className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border bg-white px-3 font-medium hover:bg-slate-50" href={link({ w: String(curWeek) })}>Tuần này</Link>
                  {writeButton}
                </div>
              </div>
            </div>

            {dayList.map(({ d, iso, list }) => {
              const done = list.filter((s) => logOf.has(`${s.id}|${iso}`)).length;
              const isToday = iso === isoDate(today);
              const past = d.getTime() < today.getTime();
              return (
                <div key={iso} className="diary-day item-card overflow-hidden rounded-lg border bg-white [&_table]:table-fixed [&_th:nth-child(1)]:w-[9%] [&_th:nth-child(2)]:w-[16%] [&_th:nth-child(3)]:w-[20%] [&_th:nth-child(4)]:w-[27%] [&_th:nth-child(5)]:w-[16%] [&_th:nth-child(6)]:w-[12%]">
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2 text-sm font-semibold">
                    <span>{WEEKDAYS[d.getUTCDay()]} · {fmtDate(d)}{isToday && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">Hôm nay</span>}</span>
                    <span className="font-normal text-slate-500">{list.length ? `${done}/${list.length} tiết đã ghi` : "Không có tiết"}</span>
                  </div>
                  {list.length > 0 && (
                    <Table bare head={["Tiết", "Môn", "GVBM", "Đánh giá", "Xếp loại", "HS vắng"]}>
                      {list.map((s) => {
                        const log = logOf.get(`${s.id}|${iso}`);
                        const rt = log?.conductRating ? RATING[log.conductRating] : null;
                        return (
                          <tr key={s.id} className="align-middle [&>td]:!py-3">
                            <td className="w-20 whitespace-nowrap"><Link data-row href={`/so-dau-bai/ghi?slot=${s.id}&d=${iso}`} className="font-semibold tabular-nums hover:text-orange-700">Tiết {s.periodNo}</Link></td>
                            <td className="font-medium">{s.assignment.subject.subjectName}</td>
                            <td>{s.assignment.teacher.fullName}</td>
                            <td className="max-w-xs"><span className="line-clamp-2 text-slate-600">{log?.note || <span className="text-slate-400">—</span>}</span></td>
                            <td className="whitespace-nowrap">{log ? (rt ? <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${rt[1]}`}><b>{GRADE_LETTER[log.conductRating!]}</b>{rt[0]}</span> : <span className="text-xs text-slate-400">Chưa xếp loại</span>) : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${past ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"}`}>{past ? "Chưa ghi (quá ngày)" : "Chưa ghi"}</span>}</td>
                            <td className="w-24 tabular-nums">{log ? log.attendanceAbsentCount : <span className="text-slate-400">—</span>}</td>
                          </tr>
                        );
                      })}
                    </Table>
                  )}
                </div>
              );
            })}
          </div>
        );
}
