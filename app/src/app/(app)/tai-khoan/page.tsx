import { BulkAccounts } from "@/components/bulk-accounts";
import Link from "next/link";
import { ViewToggle, pickView } from "@/components/view-toggle";
import { AutoForm } from "@/components/auto-form";
import { db } from "@/lib/db";
import { requireRole, ADMIN_ROLES, type Role } from "@/lib/guard";
import { ROLE_LABEL } from "@/lib/nav";
import { ActionForm } from "@/components/action-form";
import { DialogButton } from "@/components/dialog";
import { Field, inputCls, Table, Tabs, Title } from "@/components/ui";
import { MobileCollapse } from "@/components/mobile-collapse";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { BulkResetPasswords } from "@/components/bulk-reset-passwords";
import { BULK_RESET_BATCH } from "@/modules/admin/admin.service";
import { importAccounts, createAccount, resetAccountPassword, toggleAccount, previewBulkReset, runBulkReset } from "./actions";

const TABS: [string, string][] = [["all", "Tất cả"], ["ADMIN", "Quản trị"], ["PRINCIPAL", "Hiệu trưởng"], ["VICE_PRINCIPAL", "Hiệu phó"], ["HOMEROOM_TEACHER", "GVCN"], ["SUBJECT_TEACHER", "GVBM"], ["LIBRARIAN", "Thủ thư"], ["STUDENT", "Học sinh"]];
const CREATE_ROLES: Role[] = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN"];

export default async function Accounts({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; status?: string; sort?: string; page?: string; size?: string; v?: string }> }) {
  await requireRole(...ADMIN_ROLES);
  const sp = await searchParams;
  const { q = "", tab = "all", status = "", sort = "az" } = sp;
  const view = pickView(sp.v, "table");
  const pg = getPaging(sp);

  const kw = q.trim();
  const ci = (v: string) => ({ contains: v, mode: "insensitive" as const });
  // Tìm kiếm + trạng thái áp dụng trước, số đếm ở các tab phản ánh đúng kết quả đã lọc
  const base = {
    ...(kw ? { OR: [{ email: ci(kw) }, { teacher: { OR: [{ fullName: ci(kw) }, { code: ci(kw) }] } }, { student: { OR: [{ fullName: ci(kw) }, { code: ci(kw) }] } }] } : {}),
    ...(status === "active" ? { isActive: true } : status === "locked" ? { isActive: false } : {}),
  };
  const tabWhere = tab === "all" ? {} : { roles: { has: tab as Role } };
  const orderBy = sort === "za" ? { email: "desc" as const } : sort === "new" ? { createdAt: "desc" as const } : { email: "asc" as const };

  const year = await db.academicYear.findFirst({ where: { startDate: { lte: new Date() } }, orderBy: { startDate: "desc" } });
  const classes = year ? await db.schoolClass.findMany({ where: { academicYearId: year.id }, orderBy: [{ gradeLevel: { gradeName: "asc" } }, { className: "asc" }], select: { id: true, className: true } }) : [];
  const [users, ...countList] = await Promise.all([
    db.user.findMany({
      where: { ...base, ...tabWhere }, orderBy, skip: pg.skip, take: pg.take,
      include: {
        teacher: { select: { fullName: true, code: true } },
        student: { select: { fullName: true, code: true, enrollments: { take: 1, orderBy: { academicYear: { startDate: "desc" } }, select: { schoolClass: { select: { className: true } } } } } },
      },
    }),
    ...TABS.map(([k]) => db.user.count({ where: { ...base, ...(k === "all" ? {} : { roles: { has: k as Role } }) } })),
  ]);
  const counts: Record<string, number> = Object.fromEntries(TABS.map(([k], i) => [k, countList[i]]));
  const params = { q, tab, status, sort, size: sp.size, v: sp.v };
  const tabHref = (k: string) => `/tai-khoan?tab=${k}&q=${encodeURIComponent(q)}&status=${status}&sort=${sort}`;

  const nameOf = (u: (typeof users)[number]) => u.teacher?.fullName ?? u.student?.fullName ?? u.email;
  const profileOf = (u: (typeof users)[number]) =>
    u.student ? `Học sinh · ${u.student.code ?? "—"}${u.student.enrollments[0] ? ` · lớp ${u.student.enrollments[0].schoolClass.className}` : ""}` : u.teacher ? `Giáo viên · ${u.teacher.code ?? "—"}` : "Chưa có hồ sơ";

  const UserCard = ({ u }: { u: (typeof users)[number] }) => {
    const hue = [...u.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
    return (
      <Link href={`/tai-khoan/${u.id}`} className={`block rounded-xl border bg-white p-3 shadow-sm transition-colors hover:border-orange-400 active:bg-slate-50 ${u.isActive ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full text-base font-bold" style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 25%)` }}>{nameOf(u).split(" ").pop()?.[0]?.toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className={`truncate font-semibold ${u.isActive ? "" : "line-through"}`}>{nameOf(u)}</div>
            <div className="truncate text-xs text-slate-500">{u.email}</div>
          </div>
          <span className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold ${u.isActive ? "text-green-700" : "text-red-600"}`}><i className={`inline-block size-2 rounded-full ${u.isActive ? "bg-green-500" : "bg-red-500"}`} />{u.isActive ? "Hoạt động" : "Đã khoá"}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {u.roles.map((r) => <span key={r} className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">{ROLE_LABEL[r]}</span>)}
        </div>
        <div className="mt-1.5 truncate text-xs text-slate-500">{profileOf(u)}</div>
      </Link>
    );
  };

  const RowActions = ({ u }: { u: (typeof users)[number] }) => (
    <>
      <ActionForm action={resetAccountPassword} submit="Reset MK" compact className="flex gap-2 items-center" reset={false} confirmText="Cấp lại mật khẩu cho tài khoản này?"><input type="hidden" name="userId" value={u.id} /></ActionForm>
      <ActionForm action={toggleAccount} submit={u.isActive ? "Khoá" : "Mở"} compact danger={u.isActive} className="flex gap-2 items-center"><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="lock" value={u.isActive ? "1" : "0"} /></ActionForm>
    </>
  );

  const resetRoles = (["STUDENT", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN", "VICE_PRINCIPAL", "PRINCIPAL", "ADMIN"] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  const accountActions = <><Link href="/tai-khoan/ra-soat" className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border bg-white px-4 text-sm font-medium hover:bg-slate-50">Rà soát tài khoản</Link><DialogButton label="Cấp lại MK hàng loạt" title="Cấp lại mật khẩu hàng loạt" variant="secondary" width="md"><BulkResetPasswords roles={resetRoles} classes={classes.map((c) => ({ value: c.id, label: c.className }))} batchSize={BULK_RESET_BATCH} preview={previewBulkReset} run={runBulkReset} /></DialogButton><DialogButton label="Nhập hàng loạt" title="Nhập tài khoản hàng loạt"><BulkAccounts action={importAccounts}><div className="grid grid-cols-2 gap-2">{CREATE_ROLES.map((role) => <label key={role} className="flex items-center gap-2 text-sm"><input type="checkbox" name="roles" value={role} />{ROLE_LABEL[role]}</label>)}</div></BulkAccounts></DialogButton><DialogButton label="+ Thêm tài khoản" title="Thêm tài khoản">
        <ActionForm action={createAccount} submit="Tạo tài khoản" className="flex flex-col gap-3 [&>button]:self-start">
          <Field label="Email đăng nhập"><input name="email" type="email" className={inputCls + " w-full"} required /></Field>
          <Field label="Họ tên (bắt buộc với vai trò giáo viên)"><input name="fullName" className={inputCls + " w-full"} /></Field>
          <div className="text-xs font-medium text-slate-600">Vai trò (chọn nhiều nếu một người kiêm nhiều vai trò)</div>
          <div className="grid grid-cols-2 gap-2">
            {CREATE_ROLES.map((r) => <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" name="roles" value={r} className="size-4" /> {ROLE_LABEL[r]}</label>)}
          </div>
          <p className="text-xs text-slate-500">Tài khoản học sinh được tạo ở mục Học sinh. Mật khẩu được sinh ngẫu nhiên, chỉ hiện một lần.</p>
        </ActionForm>
      </DialogButton></>;
  return (
    <div className="space-y-4">
      <Title right={accountActions}>Tài khoản ({counts.all})</Title>
      <Tabs current={tabHref(tab)} items={TABS.map(([k, l]) => [tabHref(k), `${l} (${counts[k] ?? 0})`] as [string, string])} />
      <div className="flex flex-wrap items-center gap-2">
      <AutoForm className="flex min-w-0 w-full flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={tab} /><input type="hidden" name="v" value={view} />
        <input name="q" defaultValue={q} placeholder="Tìm theo email, tên, mã..." className={inputCls + " min-w-0 flex-1 md:min-w-48"} />
        <MobileCollapse active={[status, sort !== "az" ? sort : ""].filter(Boolean).length}>
          <select name="status" defaultValue={status} className={inputCls}><option value="">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="locked">Đã khoá</option></select>
          <select name="sort" defaultValue={sort} className={inputCls}><option value="az">Email A-Z</option><option value="za">Email Z-A</option><option value="new">Mới nhất</option></select>
          <ViewToggle path="/tai-khoan" params={{ q, tab, status, sort, size: sp.size }} view={view} />
        </MobileCollapse>

      </AutoForm>

      </div>
      {view !== "cards" && (
        <div className="space-y-2 md:hidden">
          {users.map((u) => <UserCard key={u.id} u={u} />)}
          {!users.length && <p className="py-8 text-center text-sm text-slate-500">Không có tài khoản phù hợp.</p>}
        </div>
      )}
      {view === "table" ? (
        <div className="hidden md:block"><Table head={["Tài khoản", "Vai trò", "Hồ sơ", "Trạng thái", ""]}>
          {users.map((u) => {
            const hue = [...u.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
            return (
              <tr key={u.id} className={`align-middle [&>td]:!py-3 ${u.isActive ? "" : "opacity-60"}`}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 25%)` }}>{nameOf(u).split(" ").pop()?.[0]?.toUpperCase()}</span>
                    <div className="min-w-0">
                      <Link data-row href={`/tai-khoan/${u.id}`} className={`block truncate font-semibold hover:text-orange-700 ${u.isActive ? "" : "line-through"}`}>{nameOf(u)}</Link>
                      <div className="truncate text-xs text-slate-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="max-w-xs"><div className="flex flex-wrap gap-1">{u.roles.map((r) => <span key={r} className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">{ROLE_LABEL[r]}</span>)}</div></td>
                <td className="text-sm text-slate-600">{profileOf(u)}</td>
                <td><div className={`flex items-center gap-2 text-sm font-semibold ${u.isActive ? "text-green-700" : "text-red-600"}`}><i className={`inline-block size-2 rounded-full ${u.isActive ? "bg-green-500" : "bg-red-500"}`} />{u.isActive ? "Hoạt động" : "Đã khoá"}</div>{u.mustChangePwd && <div className="mt-0.5 pl-4 text-xs text-slate-500">Chưa đổi mật khẩu</div>}{u.lockedUntil && u.lockedUntil.getTime() > new Date().getTime() && <div className="mt-0.5 pl-4 text-xs font-semibold text-red-600">Tạm khoá do nhập sai</div>}</td>
                <td><div className="flex items-center justify-end gap-2"><RowActions u={u} /></div></td>
              </tr>
            );
          })}
          {!users.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Không có tài khoản phù hợp.</td></tr>}
        </Table></div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4">
          {users.map((u) => <UserCard key={u.id} u={u} />)}
          {!users.length && <p className="text-sm text-slate-500">Không có tài khoản phù hợp.</p>}
        </div>
      )}
      <Pagination total={counts[tab] ?? 0} page={pg.page} size={pg.size} path="/tai-khoan" params={params} />
    </div>
  );
}
