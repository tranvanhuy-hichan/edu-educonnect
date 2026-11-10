import { effectiveSlots } from "@/modules/scheduling/effective";
import Link from "next/link";
import { ViewToggle, pickView } from "@/components/view-toggle";
import { DoorOpen, Users } from "lucide-react";
import { db } from "@/lib/db";
import { MANAGER_ROLES, TEACHING_ROLES, requireRole } from "@/lib/guard";
import { ActionMenu } from "@/components/action-menu";
import { AutoForm } from "@/components/auto-form";
import { DialogButton } from "@/components/dialog";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, Table, Title } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { todayUTC } from "@/lib/format";
import { ROOM_TYPES, currentTerm, dowOf, roomTypeLabel } from "@/lib/catalog";
import { createRoom } from "./actions";

export default async function Rooms({ searchParams }: { searchParams: Promise<{ page?: string; size?: string; type?: string; v?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const canEdit = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const sp = await searchParams;
  const view = pickView(sp.v, "cards");
  const pg = getPaging(sp, 12);
  const dow = dowOf(todayUTC());
  const term = await currentTerm();
  const where = sp.type ? { roomType: sp.type } : {};
  const [total, rooms] = await Promise.all([
    db.room.count({ where }),
    db.room.findMany({
      where, orderBy: { roomName: "asc" }, skip: pg.skip, take: pg.take,
      include: {
        timetableSlots: {
          where: { ...effectiveSlots(), academicTermId: term?.id ?? "-" },
          orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }],
          select: { id: true, dayOfWeek: true, periodNo: true, schoolClass: { select: { id: true, className: true } }, assignment: { select: { subject: { select: { subjectName: true } }, teacher: { select: { fullName: true } } } } },
        },
      },
    }),
  ]);
  const info = rooms.map((r) => {
    const today = r.timetableSlots.filter((s) => s.dayOfWeek === dow);
    const classes = [...new Map(r.timetableSlots.map((s) => [s.schoolClass.id, s.schoolClass.className])).entries()];
    return { r, today, classes };
  });
  const roomForm = (
        <ActionForm action={createRoom} submit="Thêm phòng" className="flex flex-col gap-3 [&>button]:self-start">
          <Field label="Loại phòng"><select name="roomType" defaultValue={sp.type ?? "THUONG"} className={inputCls + " w-full"}>{Object.entries(ROOM_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Tên phòng"><input name="name" className={inputCls + " w-full"} required /></Field>
          <Field label="Sức chứa"><input name="capacity" defaultValue={40} className={inputCls + " w-full"} /></Field>
        </ActionForm>
  );
  return (
    <div className="space-y-4">
      <Title actionsInline right={<>
        {canEdit && <div className="hidden md:block"><DialogButton label="+ Thêm phòng" title="Thêm phòng học">{roomForm}</DialogButton></div>}
        <div className="md:hidden"><ActionMenu label="Tùy chọn phòng học" wide>
          <ViewToggle path="/phong-hoc" params={{ type: sp.type, size: sp.size }} view={view} />
          {canEdit && <div className="[&>button]:w-full [&>button]:justify-start"><DialogButton variant="ghost" label="Thêm phòng" title="Thêm phòng học">{roomForm}</DialogButton></div>}
        </ActionMenu></div>
      </>}>Phòng học ({total})</Title>

      <div className="flex items-center gap-2">
        <AutoForm className="min-w-0 w-full md:w-64">
          <input type="hidden" name="v" value={view} />
          <input type="hidden" name="size" value={pg.size} />
          <select key={sp.type ?? ""} name="type" defaultValue={sp.type ?? ""} aria-label="Loại phòng học" className={inputCls + " col-span-full w-full min-w-0"}>
            <option value="">Tất cả loại phòng</option>
            {Object.entries(ROOM_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </AutoForm>
        <div className="ml-auto hidden md:block"><ViewToggle path="/phong-hoc" params={{ type: sp.type, size: sp.size }} view={view} /></div>
      </div>
      {view === "cards" ? (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {info.map(({ r, today, classes }) => (
          <Link key={r.id} href={`/phong-hoc/${r.id}`}>
          <Card className="flex h-full flex-col gap-3 transition-colors hover:border-orange-400">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 basis-44 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700"><DoorOpen className="size-5" /></span>
                <div className="min-w-0 break-words">
                  <div className="text-base font-semibold leading-tight">{r.roomName}</div>
                  <div className="text-xs font-medium text-orange-700">{roomTypeLabel(r.roomType)}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-500"><Users className="size-3.5" /> Sức chứa {r.capacity} chỗ</div>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${today.length ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800"}`}>{today.length ? `${today.length} tiết hôm nay` : "Trống hôm nay"}</span>
            </div>

            <div className="text-sm">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Lớp sử dụng ({classes.length})</div>
              {classes.length ? (
                <div className="flex flex-wrap gap-1">
                  {classes.slice(0, 4).map(([id, name]) => <span key={id} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{name}</span>)}
                  {classes.length > 4 && <span className="px-1 text-xs text-slate-500">+{classes.length - 4}</span>}
                </div>
              ) : <span className="text-slate-400">Chưa xếp lớp nào</span>}
            </div>

            {today.length > 0 && (
              <div className="space-y-0.5 border-t pt-2 text-xs text-slate-600">
                {today.map((s) => <div key={s.id}><b>Tiết {s.periodNo}</b> · {s.schoolClass.className} · {s.assignment.subject.subjectName}</div>)}
              </div>
            )}

          </Card>
          </Link>
        ))}
        {!rooms.length && <p className="text-sm text-slate-500">Chưa có phòng học.</p>}
      </div>
      ) : (
        <Table head={["Phòng", "Loại phòng", "Sức chứa", "Lớp sử dụng", "Hôm nay"]}>
          {info.map(({ r, today, classes }) => (
              <tr key={r.id} className="align-middle [&>td]:!py-3">
                <td><Link data-row href={`/phong-hoc/${r.id}`} className="font-semibold text-orange-700 hover:underline">{r.roomName}</Link></td>
                <td>{roomTypeLabel(r.roomType)}</td>
                <td>{r.capacity} chỗ</td>
                <td className="max-w-md">{classes.length ? <div className="flex flex-wrap gap-1">{classes.slice(0, 4).map(([id, name]) => <span key={id} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{name}</span>)}{classes.length > 4 && <span className="px-1 text-xs text-slate-500">+{classes.length - 4}</span>}</div> : <span className="text-slate-400">-</span>}</td>
                <td>{today.length ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">{today.length} tiết</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Trống</span>}</td>
              </tr>
          ))}
          {!rooms.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa có phòng học.</td></tr>}
        </Table>
      )}
      <Pagination total={total} page={pg.page} size={pg.size} path="/phong-hoc" params={{ size: sp.size, type: sp.type, v: sp.v }} />
    </div>
  );
}
