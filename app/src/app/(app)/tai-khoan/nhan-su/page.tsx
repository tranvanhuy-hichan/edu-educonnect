import { AutoForm } from "@/components/auto-form";
import { AccountTabs } from "@/components/account-tabs";
import Link from "next/link";
import { LockKeyhole, Pencil, Plus, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, type Role } from "@/lib/guard";
import { ROLE_LABEL } from "@/lib/nav";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls } from "@/components/ui";
import { createAccount, updateAccountRoles } from "../actions";
import { assignUnionLeader, createStandaloneUnionAccount, manageStandaloneUnionAccount } from "./actions";

const STAFF_ROLES: Role[] = ["PRINCIPAL", "VICE_PRINCIPAL", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN"];
const POSITIONS = ["Bí thư Đoàn trường", "Phó Bí thư Đoàn trường", "Ủy viên Ban Thường vụ Đoàn trường", "Ủy viên Ban chấp hành Đoàn trường"];
const formClass = "flex flex-col gap-4";
const fieldClass = `${inputCls} w-full`;
const badge = "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium";
const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map((s) => s[0]).join("").toUpperCase();

const RoleFields = ({ roles = [], teacher = true }: { roles?: readonly string[]; teacher?: boolean }) => <div className="grid gap-2 sm:grid-cols-2">{STAFF_ROLES.map((r) => {
    const disabled = !teacher && ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"].includes(r);
    return <label key={r} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${disabled ? "opacity-50" : "cursor-pointer hover:bg-slate-50"}`}><input className="size-4 accent-[var(--accent)]" type="checkbox" name="roles" value={r} defaultChecked={roles.includes(r)} disabled={disabled} />{ROLE_LABEL[r]}</label>;
  })}</div>;

export default async function PersonnelPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const group = ["staff", "union"].includes(sp.group ?? "") ? sp.group! : "all";
  const [staff, standalone] = await Promise.all([
    db.user.findMany({
      where: { NOT: { roles: { has: "STUDENT" } }, ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { teacher: { fullName: { contains: q, mode: "insensitive" } } }, { account: { username: { contains: q, mode: "insensitive" } } }] } : {}) },
      include: { teacher: true, account: { select: { id: true, username: true, fullName: true, role: true, position: true, superAdmin: true, status: true } } }, orderBy: { account: { fullName: "asc" } },
    }),
    db.doanUser.findMany({ where: { role: "ADMIN", superAdmin: false, eduUser: { is: null }, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }] } : {}) }, select: { id: true, username: true, fullName: true, position: true, status: true }, orderBy: { fullName: "asc" } }),
  ]);
  const unionCount = standalone.length + staff.filter((u) => u.account.role === "ADMIN").length;
  const visibleStaff = group === "union" ? staff.filter((u) => u.account.role === "ADMIN") : staff;
  const visibleStandalone = group === "staff" ? [] : standalone;
  const visibleCount = visibleStaff.length + visibleStandalone.length;

  return <div className="w-full space-y-5">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><h1 className="text-2xl font-semibold tracking-tight">Tài khoản & Nhân sự</h1><p className="mt-1 text-sm text-slate-500">Hồ sơ nhân sự, vai trò chuyên môn và phân công Đoàn trường.</p></div>
      <div className="flex flex-wrap gap-2">
        <DialogButton label={<><UserPlus className="size-4" />Thêm BCH riêng</>} title="Thêm tài khoản BCH riêng" variant="secondary" width="sm">
          <p className="mb-4 text-sm text-slate-500">Dành cho học sinh tham gia BCH hoặc người chưa có tài khoản giáo viên. Tài khoản học sinh được giữ riêng.</p>
          <ActionForm action={createStandaloneUnionAccount} submit="Tạo tài khoản BCH" className={formClass}>
            <Field label="Họ và tên"><input name="fullName" required minLength={2} maxLength={100} autoComplete="name" className={fieldClass} /></Field>
            <Field label="Tên đăng nhập BCH"><input name="username" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" autoComplete="off" className={fieldClass} /></Field>
            <Field label="Chức danh"><input name="position" required minLength={2} maxLength={60} placeholder="Ví dụ: Ủy viên BCH Đoàn trường" className={fieldClass} /></Field>
          </ActionForm>
        </DialogButton>
        <DialogButton label={<><Plus className="size-4" />Thêm nhân sự</>} title="Thêm nhân sự" width="md">
          <ActionForm action={createAccount} submit="Tạo nhân sự" className={formClass}>
            <Field label="Họ và tên"><input name="fullName" required maxLength={100} autoComplete="name" className={fieldClass} /></Field>
            <Field label="Email đăng nhập"><input name="email" type="email" required autoComplete="email" className={fieldClass} /></Field>
            <div><p className="mb-2 text-sm font-medium">Vai trò EduConnect</p><RoleFields roles={["SUBJECT_TEACHER"]} /></div>
            <p className="text-xs text-slate-500">Mật khẩu ban đầu được tạo tự động và tải về sau khi lưu.</p>
          </ActionForm>
        </DialogButton>
      </div>
    </header>
    <AccountTabs current="/tai-khoan/nhan-su" />
    <div className="grid grid-cols-3 gap-3">
      {[["Nhân sự", staff.length, Users], ["Ban chấp hành", unionCount, ShieldCheck], ["BCH riêng", standalone.length, UserPlus]].map(([label, value, Icon]) => {
        const I = Icon as typeof Users;
        return <Card key={String(label)} className="flex items-center gap-3 !p-3 sm:!p-4"><span className="hidden rounded-lg bg-slate-100 p-2.5 text-slate-500 sm:block"><I className="size-5" /></span><div><p className="text-xs text-slate-500 sm:text-sm">{String(label)}</p><p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{String(value)}</p></div></Card>;
      })}
    </div>
    <Card className="overflow-hidden !p-0">
      <div className="flex flex-col justify-between gap-3 border-b p-4 lg:flex-row lg:items-center">
        <AutoForm className="flex w-full flex-wrap items-center gap-2">
          <label className="flex w-full items-center gap-2 text-sm text-slate-500 sm:w-auto"><span className="shrink-0">Nhóm</span><select key={group} name="group" defaultValue={group} className={inputCls + " min-w-0 flex-1 sm:flex-none"} aria-label="Nhóm nhân sự"><option value="all">Tất cả ({staff.length + standalone.length})</option><option value="staff">Nhân sự ({staff.length})</option><option value="union">Ban chấp hành ({unionCount})</option></select></label>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:max-w-sm sm:flex-1"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" /><input aria-label="Tìm nhân sự" className={`${fieldClass} pl-9`} name="q" defaultValue={q} placeholder="Tìm tên hoặc tài khoản…" /></div><button className="h-9 shrink-0 rounded-md border px-3 text-sm hover:bg-slate-50">Tìm</button></div>
        </AutoForm>
      </div>
      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.15fr)_112px_220px] items-center gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid"><span>Nhân sự</span><span>Vai trò EduConnect</span><span>Chức vụ Đoàn</span><span>Trạng thái</span><span className="text-right">Thao tác</span></div>
      <div className="divide-y">
        {visibleStaff.map((u) => {
          const name = u.teacher?.fullName ?? u.account.fullName;
          const protectedAdmin = u.roles.includes("ADMIN");
          const active = u.isActive && u.account.status === "ACTIVE";
          const union = u.account.role === "ADMIN";
          const canAssign = !protectedAdmin && !!u.teacher && !u.account.superAdmin && ["ADMIN", "EXTERNAL"].includes(u.account.role);
          return <div key={u.id} data-personnel-row={protectedAdmin ? "protected-admin" : "staff"} className="grid gap-3 px-4 py-4 hover:bg-slate-50 sm:px-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.15fr)_112px_220px] xl:items-center xl:gap-4">
            <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{initials(name)}</span><div className="min-w-0"><Link className="block truncate font-semibold hover:text-orange-700" href={`/tai-khoan/${u.id}`}>{name}</Link><p className="truncate text-xs text-slate-500">{u.account.username}</p></div></div>
            <div className="flex flex-wrap gap-1">{u.roles.map((r) => <span key={r} className={`${badge} bg-slate-100 text-slate-600`}>{ROLE_LABEL[r]}</span>)}</div>
            <p className={`text-sm ${union ? "font-medium" : "text-slate-400"}`}>{union ? u.account.position ?? "Ban chấp hành" : "Chưa phân công"}</p>
            <div><span className={`${badge} ${active ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400" : "bg-slate-100 text-slate-500"}`}>{active ? "Hoạt động" : "Đã khóa"}</span></div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {protectedAdmin ? <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><LockKeyhole className="size-3.5" />Quyền được bảo vệ</span> : <>
                <DialogButton label={<><Pencil className="size-3.5" />Sửa vai trò</>} title={`Vai trò · ${name}`} variant="secondary" size="sm" width="md">
                  <ActionForm action={updateAccountRoles} submit="Lưu vai trò" className={formClass} reset={false}><input type="hidden" name="userId" value={u.id} /><RoleFields roles={u.roles} teacher={!!u.teacher} />{!u.teacher && <p className="text-xs text-slate-500">Cần hồ sơ giáo viên trước khi gán vai trò giảng dạy.</p>}</ActionForm>
                </DialogButton>
                {canAssign && (active || union) && <DialogButton label="Chức vụ Đoàn" title={`Phân công Đoàn · ${name}`} variant="ghost" size="sm" width="sm">
                  <p className="mb-4 text-sm text-slate-500">Phân công BCH không làm thay đổi quyền EduConnect.</p>
                  <ActionForm action={assignUnionLeader} submit={active ? "Lưu phân công" : "Thu hồi quyền BCH"} className={formClass} reset={false} confirmText={!active ? "Thu hồi quyền BCH của nhân sự này?" : undefined}>
                    <input type="hidden" name="accountId" value={u.accountId} />
                    {active ? <Field label="Chức danh BCH"><select name="position" defaultValue={union ? u.account.position ?? "" : ""} className={fieldClass}><option value="">Không tham gia BCH</option>{[...new Set([...POSITIONS, ...(u.account.position ? [u.account.position] : [])])].map((p) => <option key={p}>{p}</option>)}</select></Field> : <p className="text-sm">Tài khoản đang khóa. Bạn chỉ có thể thu hồi quyền BCH.</p>}
                  </ActionForm>
                </DialogButton>}
              </>}
            </div>
          </div>;
        })}
        {visibleStandalone.map((a) => <div key={a.id} data-personnel-row="standalone" className="grid gap-3 px-4 py-4 hover:bg-slate-50 sm:px-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.15fr)_112px_220px] xl:items-center xl:gap-4">
          <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{initials(a.fullName)}</span><div className="min-w-0"><p className="truncate font-semibold">{a.fullName}</p><p className="truncate text-xs text-slate-500">{a.username}</p></div></div>
          <div><span className={`${badge} bg-slate-100 text-slate-600`}>BCH riêng</span></div>
          <p className="text-sm font-medium">{a.position ?? "Ban chấp hành"}</p>
          <div><span className={`${badge} ${a.status === "ACTIVE" ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400" : "bg-slate-100 text-slate-500"}`}>{a.status === "ACTIVE" ? "Hoạt động" : "Đã khóa"}</span></div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <DialogButton label={<><Pencil className="size-3.5" />Chỉnh sửa</>} title={`Chức danh · ${a.fullName}`} variant="secondary" size="sm" width="sm"><ActionForm action={manageStandaloneUnionAccount} submit="Lưu chức danh" className={formClass} reset={false}><input type="hidden" name="accountId" value={a.id} /><input type="hidden" name="command" value="save" /><Field label="Chức danh BCH"><input name="position" defaultValue={a.position ?? ""} required minLength={2} maxLength={60} className={fieldClass} /></Field></ActionForm></DialogButton>
            <DialogButton label="Bảo mật" title={`Tài khoản BCH · ${a.fullName}`} variant="ghost" size="sm" width="sm"><p className="mb-4 text-sm text-slate-500">Chỉ tác động tài khoản BCH riêng, không thay đổi tài khoản học sinh.</p><ActionForm action={manageStandaloneUnionAccount} submit="Xác nhận" className={formClass} reset={false} confirmText="Thực hiện thao tác bảo mật trên tài khoản BCH riêng?"><input type="hidden" name="accountId" value={a.id} /><Field label="Thao tác"><select name="command" className={fieldClass}><option value="reset">Cấp lại mật khẩu BCH</option><option value={a.status === "ACTIVE" ? "lock" : "unlock"}>{a.status === "ACTIVE" ? "Khóa tài khoản BCH" : "Mở khóa tài khoản BCH"}</option></select></Field></ActionForm></DialogButton>
          </div>
        </div>)}
        {!visibleCount && <div className="px-5 py-12 text-center text-sm text-slate-500">Không tìm thấy nhân sự phù hợp.</div>}
      </div>
      <div className="border-t px-5 py-3 text-xs text-slate-500">{visibleCount} tài khoản · Quyền quản trị hệ thống được bảo vệ.</div>
    </Card>
  </div>;
}
