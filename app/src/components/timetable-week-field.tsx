import { Field, inputCls } from "@/components/ui";
import { addDays, fmtDate, isoDate, mondayOf, todayUTC } from "@/lib/format";
import { weekNumber } from "@/lib/week";

export function TimetableWeekField({ term, selected }: { term: { startDate: Date; endDate: Date; academicYear: { startDate: Date } }; selected?: Date }) {
  const first = mondayOf(term.startDate);
  const last = mondayOf(term.endDate);
  const preferred = mondayOf(selected ?? todayUTC());
  const initial = preferred < first ? first : preferred > last ? last : preferred;
  const weeks: Date[] = [];
  for (let date = first; date <= last; date = addDays(date, 7)) weeks.push(date);
  return <Field label="Bắt đầu áp dụng từ tuần">
    <select name="startsOn" required defaultValue={isoDate(initial)} className={inputCls + " w-full"}>
      {weeks.map((date) => <option key={isoDate(date)} value={isoDate(date)}>Tuần {weekNumber(term.academicYear.startDate, date)} · {fmtDate(date)} – {fmtDate(addDays(date, 6))}</option>)}
    </select>
  </Field>;
}
