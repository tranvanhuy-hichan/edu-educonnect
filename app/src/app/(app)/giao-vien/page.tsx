import { ActionMenu } from "@/components/action-menu";
import { BulkAccounts } from "@/components/bulk-accounts";
import { DialogButton } from "@/components/dialog";
import { importTeachers } from "./actions";
import Link from "next/link";
import { PersonCard } from "@/components/person-card";
import { ViewToggle, pickView } from "@/components/view-toggle";
import { AutoForm } from "@/components/auto-form";
import { db } from "@/lib/db";
import { MANAGER_ROLES, TEACHING_ROLES, requireRole } from "@/lib/guard";
import { inputCls, Table, Tabs, Title } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { ROLE_TAG } from "@/lib/catalog";

const TABS: [string, string][] = [["all", "Tất cả"], ["hr", "GVCN"], ["subj", "GVBM"], ["free", "Chưa phân công"], ["locked", "Đã khóa"]];

export default async function Teachers({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; page?: string; size?: string; v?: string }> }) {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  const canEdit = me.roles.some((r) => MANAGER_ROLES.includes(r));
  const sp = await searchParams;
  const { q = "", tab = "all" } = sp;
  const view = pickView(sp.v, "cards");
  const pg = getPaging(sp, 12);
  const search = q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { code: { contains: q, mode: "insensitive" as const } }, { user: { email: { contains: q, mode: "insensitive" as const } } }] } : {};
  const filt: Record<string, object> = {
    all: {}, hr: { user: { roles: { has: "HOMEROOM_TEACHER" } } }, subj: { user: { roles: { has: "SUBJECT_TEACHER" } } },
    free: { homeroomClasses: { none: {} }, assignments: { none: {} } }, locked: { user: { isActive: false } },
  };
  const where = { ...search, ...filt[tab] };
  const [total, list, ...cnt] = await Promise.all([
    db.teacher.count({ where }),
    db.teacher.findMany({ where, orderBy: { fullName: "asc" }, skip: pg.skip, take: pg.take, select: { id: true, fullName: true, code: true, phone: true, user: { select: { email: true, isActive: true, roles: true } }, subjects: { select: { subject: { select: { subjectName: true } } } }, assignments: { distinct: ["schoolClassId"], select: { schoolClassId: true } }, _count: { select: { homeroomClasses: true, assignments: true } } } }),
    ...TABS.map(([k]) => db.teacher.count({ where: { ...search, ...filt[k] } })),
  ]);
  const link = (t: string) => `/giao-vien?tab=${t}&q=${encodeURIComponent(q)}`;
  const tags = (t: (typeof list)[number]) => t.user.roles.filter((r) => r === "HOMEROOM_TEACHER" || r === "SUBJECT_TEACHER").map((r) => ROLE_TAG[r]).join(" · ");
  const subj = (t: (typeof list)[number]) => t.subjects.map((x) => x.subject.subjectName).sort((a, b) => a.localeCompare(b, "vi")).join(", ") || "Chưa chọn môn";
  const teaching = (t: (typeof list)[number]) => new Set(t.assignments.map((a) => a.schoolClassId)).size;
  const stats = (t: (typeof list)[number]) => [{ label: "Môn phụ trách", value: subj(t) }, { label: "Chủ nhiệm", value: `${t._count.homeroomClasses} lớp` }, { label: "Đang dạy", value: `${teaching(t)} lớp` }];
  const badge = (t: (typeof list)[number]) => (!t.user.isActive ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">TK bị khoá</span> : null);

  return (
    <div className="space-y-4">
      <Title actionsInline right={<div className="md:hidden"><ActionMenu label="Thao tác giáo viên">
        <ViewToggle path="/giao-vien" params={{ q, tab, size: sp.size }} view={view} />
        {canEdit && <div className="flex flex-col gap-1 [&>button]:w-full [&>button]:justify-start"><DialogButton variant="ghost" label="Nhập hàng loạt" title="Nhập giáo viên hàng loạt"><BulkAccounts action={importTeachers} /></DialogButton><Link href="/giao-vien/them" className="flex min-h-10 items-center rounded-md px-4 text-sm hover:bg-slate-50">Thêm giáo viên</Link></div>}
      </ActionMenu></div>}>Giáo viên ({cnt[0]})</Title>
      <Tabs current={link(tab)} items={TABS.map(([k, l], i) => [link(k), `${l} (${cnt[i]})`] as [string, string])} />
      <div className="teacher-toolbar flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center"><AutoForm className="teacher-search flex w-full min-w-0 flex-1 gap-2 md:w-auto"><input type="hidden" name="tab" value={tab} /><input type="hidden" name="v" value={view} /><input name="q" defaultValue={q} placeholder="Tìm theo tên, SĐT, mã, email..." className={inputCls + " min-w-0 w-full flex-1"} /><div className="hidden md:block"><ViewToggle path="/giao-vien" params={{ q, tab, size: sp.size }} view={view} /></div></AutoForm>{canEdit && <div className="ml-auto hidden items-center gap-2 md:flex"><DialogButton label="Nhập hàng loạt" title="Nhập giáo viên hàng loạt"><BulkAccounts action={importTeachers} /></DialogButton><Link href="/giao-vien/them" className="inline-flex h-9 items-center rounded-md bg-coral-600 px-4 text-sm font-medium text-white hover:bg-coral-700">+ Thêm giáo viên</Link></div>}</div>
      {view !== "cards" && <div className="space-y-2 md:hidden">{list.map((t) => <PersonCard key={t.id} href={`/giao-vien/${t.id}`} name={t.fullName} tag={tags(t)} badge={badge(t)} phone={t.phone} email={t.user.email} stats={stats(t)} />)}{!list.length && <p className="py-8 text-center text-sm text-slate-500">Không tìm thấy giáo viên.</p>}</div>}
      {view === "cards" ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4">{list.map((t) => <PersonCard key={t.id} href={`/giao-vien/${t.id}`} name={t.fullName} tag={tags(t)} badge={badge(t)} phone={t.phone} email={t.user.email} stats={stats(t)} />)}{!list.length && <p className="text-sm text-slate-500">Không tìm thấy giáo viên.</p>}</div>
      ) : (
        <div className="hidden md:block"><Table head={["Giáo viên", "Môn phụ trách", "Vai trò", "Điện thoại", "Chủ nhiệm", "Đang dạy"]}>
          {list.map((t) => (
            <tr key={t.id} className="align-middle [&>td]:!py-3">
              <td><Link data-row href={`/giao-vien/${t.id}`} className="font-semibold text-orange-700 hover:underline">{t.fullName}</Link>{badge(t) && <span className="ml-2">{badge(t)}</span>}<div className="text-xs text-slate-500">{t.code} · {t.user.email}</div></td>
              <td>{subj(t)}</td><td>{tags(t) || "-"}</td><td>{t.phone ?? "-"}</td><td>{t._count.homeroomClasses} lớp</td><td>{teaching(t)} lớp</td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Không tìm thấy giáo viên.</td></tr>}
        </Table></div>
      )}
      <Pagination total={total} page={pg.page} size={pg.size} path="/giao-vien" params={{ q, tab, size: sp.size, v: sp.v }} />
    </div>
  );
}
