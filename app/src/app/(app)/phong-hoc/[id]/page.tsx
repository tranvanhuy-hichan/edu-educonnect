import { effectiveSlots } from "@/modules/scheduling/effective";
import { SearchableSelect } from "@/components/searchable-select";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, DoorOpen, School, Users } from "lucide-react";
import { db } from "@/lib/db";
import { getPolicy } from "@/lib/policy";
import { labelOf } from "@/lib/policy-schema";
import { ADMIN_ROLES, MANAGER_ROLES, TEACHING_ROLES, requireRole } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, Table, Tabs } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { hueOf } from "@/components/schedule-chips";
import { todayUTC } from "@/lib/format";
import { DAYS, DAY_NAME, currentTerm, dowOf } from "@/lib/catalog";
import { deleteRoom, updateRoom } from "../actions";

const TABS = [["overview", "Tổng quan"], ["classes", "Lớp sử dụng"], ["schedule", "Lịch sử dụng"], ["settings", "Thông tin & Xoá"]] as const;

const Stat = ({ icon: I, label, value, tone = "bg-orange-100 text-orange-700" }: { icon: typeof Users; label: string; value: React.ReactNode; tone?: string }) => (
  <Card className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
    <span className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}><I className="size-4 sm:size-5" /></span>
    <div className="min-w-0"><div className="text-xs leading-tight text-slate-500">{label}</div><div className="truncate text-lg font-bold sm:text-xl">{value}</div></div>
  </Card>
);

export default async function RoomDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; page?: string; size?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const roomTypes = (await getPolicy()).roomTypes;
  const canEdit = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const { id } = await params;
  const sp = await searchParams;
  const tabs = TABS.filter(([k]) => canEdit || k !== "settings");
  const tab = tabs.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const pg = getPaging(sp, 12);
  const room = await db.room.findUnique({ where: { id } });
  if (!room) notFound();
  const isAdmin = me.roles.some((r) => ADMIN_ROLES.includes(r));

  const term = await currentTerm();
  const dow = dowOf(todayUTC());
  const live = { ...effectiveSlots(), roomId: id, academicTermId: term?.id ?? "-" };
  const slotInclude = { schoolClass: true, assignment: { include: { subject: true, teacher: true } } } as const;
  const [slots, slotCount] = await Promise.all([
    db.timetableSlot.findMany({ where: live, orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }], include: slotInclude }),
    db.timetableSlot.count({ where: { roomId: id } }),
  ]);
  const todaySlots = slots.filter((s) => s.dayOfWeek === dow);
  const classes = [...new Map(slots.map((s) => [s.schoolClassId, s.schoolClass])).values()].sort((a, b) => a.className.localeCompare(b.className, "vi"));



  return (
    <div className="space-y-4">
      <Card className="detail-header flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700"><DoorOpen className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{room.roomName}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${todaySlots.length ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"}`}>{todaySlots.length ? `${todaySlots.length} tiết hôm nay` : "Trống hôm nay"}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600"><span className="font-medium text-orange-700">{labelOf(roomTypes, room.roomType)}</span><span className="flex items-center gap-1"><Users className="size-4" /> Sức chứa {room.capacity} chỗ</span></div>
        </div>
        <Link href={`/lich-hoc?room=${id}`} className="inline-flex h-9 w-full items-center justify-center rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700 md:w-auto">Xem lịch phòng</Link>
      </Card>

      <Tabs current={`?tab=${tab}`} items={tabs.map(([k, l]) => [`?tab=${k}`, l] as [string, string])} />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat icon={School} label="Lớp đang sử dụng" value={classes.length} />
            <Stat icon={CalendarClock} label="Tiết hôm nay" value={todaySlots.length} tone="bg-sky-100 text-sky-700" />
            <Stat icon={CalendarClock} label={`Tiết mỗi tuần${term ? ` (${term.termName})` : ""}`} value={slots.length} tone="bg-green-100 text-green-700" />
            <Stat icon={Users} label="Sức chứa" value={`${room.capacity} chỗ`} tone="bg-yellow-100 text-yellow-700" />
          </div>
          <Card className="p-0">
            <div className="border-b px-4 py-3"><h2 className="font-semibold">Lịch sử dụng hôm nay</h2></div>
            <ul className="divide-y text-sm">
              {todaySlots.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span><b className="tabular-nums">Tiết {s.periodNo}</b> · {s.schoolClass.className} · {s.assignment.subject.subjectName}</span>
                  <span className="text-slate-500">{s.assignment.teacher.fullName}</span>
                </li>
              ))}
              {!todaySlots.length && <li className="px-4 py-8 text-center text-slate-500">Hôm nay phòng này trống.</li>}
            </ul>
          </Card>
        </div>
      )}

      {tab === "classes" && (() => {
        // thời khoá biểu cố định theo tuần của phòng
        const byDay = DAYS.map((wd) => ({ wd, items: slots.filter((s) => s.dayOfWeek === wd) }));
        return (
          <div className="space-y-4">
            <div>
              <h2 className="mb-2 font-semibold">Thời khoá biểu tuần của phòng</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {byDay.map(({ wd, items }) => (
                  <div key={wd} className="item-card rounded-lg border bg-white">
                    <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2 text-sm font-semibold">{DAY_NAME[wd]}<span className="text-xs font-normal text-slate-500">{items.length} tiết</span></div>
                    <div className="space-y-1.5 p-2">
                      {items.map((i) => {
                        const h = hueOf(i.schoolClassId);
                        return (
                          <Link key={i.id} href={`/lop-hoc/${i.schoolClassId}`} className="block rounded-md px-2 py-1.5 text-xs" style={{ background: `hsl(${h} 85% 94%)`, borderLeft: `4px solid hsl(${h} 65% 42%)`, color: `hsl(${h} 60% 18%)` }}>
                            <div className="font-semibold tabular-nums">Tiết {i.periodNo}</div>
                            <div className="text-[13px] font-semibold leading-tight">{i.schoolClass.className} · {i.assignment.subject.subjectName}</div>
                            <div className="opacity-80">{i.assignment.teacher.fullName}</div>
                          </Link>
                        );
                      })}
                      {!items.length && <div className="py-4 text-center text-xs text-slate-400">Trống</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 font-semibold">Danh sách lớp ({classes.length})</h2>
              <Table head={["Lớp", "Số tiết/tuần", "Môn học"]}>
                {classes.map((c) => {
                  const mine = slots.filter((s) => s.schoolClassId === c.id);
                  return (
                    <tr key={c.id} className="align-top">
                      <td><Link data-row href={`/lop-hoc/${c.id}`} className="font-medium text-orange-700 hover:underline">{c.className}</Link></td>
                      <td>{mine.length}</td>
                      <td>{[...new Set(mine.map((s) => s.assignment.subject.subjectName))].join(", ")}</td>
                    </tr>
                  );
                })}
                {!classes.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Chưa có lớp nào dùng phòng này.</td></tr>}
              </Table>
            </div>
          </div>
        );
      })()}

      {tab === "schedule" && await (async () => {
        const where = live;
        const [total, list] = await Promise.all([
          db.timetableSlot.count({ where }),
          db.timetableSlot.findMany({ where, orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }], skip: pg.skip, take: pg.take, include: slotInclude }),
        ]);
        return (
          <div className="space-y-3">
            <Table head={["Thứ", "Tiết", "Lớp", "Môn", "Giáo viên"]}>
              {list.map((s) => (
                <tr key={s.id} className={s.dayOfWeek === dow ? "bg-orange-50" : ""}>
                  <td className="whitespace-nowrap">{DAY_NAME[s.dayOfWeek]}</td><td className="whitespace-nowrap">Tiết {s.periodNo}</td>
                  <td>{s.schoolClass.className}</td><td>{s.assignment.subject.subjectName}</td><td>{s.assignment.teacher.fullName}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Phòng chưa được xếp tiết nào trong học kỳ này.</td></tr>}
            </Table>
            <Pagination total={total} page={pg.page} size={pg.size} path={`/phong-hoc/${id}`} params={{ tab: "schedule", size: sp.size }} />
          </div>
        );
      })()}

      {tab === "settings" && (
        <div className="space-y-4">
          <Card mobile="flat">
            <h2 className="mb-3 font-semibold">Thông tin phòng</h2>
            <ActionForm action={updateRoom} submit="Lưu thông tin" reset={false} className="grid max-w-2xl grid-cols-1 items-end gap-3 sm:grid-cols-2 [&>button]:justify-self-start">
              <input type="hidden" name="id" value={room.id} />
              <Field label="Loại phòng"><SearchableSelect name="roomType" defaultValue={room.roomType} ariaLabel="Loại phòng" className="w-full" options={roomTypes.map(({ code, label }) => ({ value: code, label }))} /></Field>
              <Field label="Tên phòng"><input name="name" defaultValue={room.roomName} className={inputCls + " w-full"} required /></Field>
              <Field label="Sức chứa"><input name="capacity" defaultValue={room.capacity} className={inputCls + " w-full"} /></Field>
            </ActionForm>
          </Card>
          {isAdmin && (
            <Card mobile="flat" className="space-y-2 border-red-300">
              <h2 className="font-semibold text-red-600">Xoá phòng</h2>
              <p className="text-sm text-slate-600">Phòng đang được xếp trong thời khoá biểu ({slotCount} tiết) thì không xoá được. Hãy chuyển các tiết sang phòng khác trước.</p>
              <ActionForm action={deleteRoom} submit="Xoá phòng này" danger confirmText={`Xoá phòng ${room.roomName}?`} className="inline-flex"><input type="hidden" name="id" value={room.id} /></ActionForm>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
