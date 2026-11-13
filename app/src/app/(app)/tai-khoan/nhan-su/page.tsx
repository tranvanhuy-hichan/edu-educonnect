import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/guard";
import { ROLE_LABEL } from "@/lib/nav";
import { ActionForm } from "@/components/action-form";
import { Card, inputCls } from "@/components/ui";
import { assignUnionLeader, createStandaloneUnionAccount, manageStandaloneUnionAccount } from "./actions";

export default async function PersonnelPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole("ADMIN");
  const q = (await searchParams).q?.trim() ?? "";
  const staff = await db.user.findMany({
    where: { NOT: { roles: { has: "STUDENT" } }, ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { teacher: { fullName: { contains: q, mode: "insensitive" } } }, { account: { username: { contains: q, mode: "insensitive" } } }] } : {}) },
    include: { teacher: true, account: { select: { id: true, username: true, fullName: true, role: true, position: true, superAdmin: true, status: true } } }, orderBy: { email: "asc" },
  });
  const standalone = await db.doanUser.findMany({ where: { role: "ADMIN", superAdmin: false, eduUser: { is: null }, ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }] } : {}) }, select: { id: true, username: true, fullName: true, position: true, status: true }, orderBy: { fullName: "asc" } });
  return <div className="space-y-4">
    <div><Link href="/tai-khoan" className="text-sm text-orange-700">← Tài khoản</Link><h1 className="text-xl font-semibold">Quản lý nhân sự</h1>
      <p className="mt-1 text-sm text-slate-600">Một tài khoản cho hai hệ thống. Vai trò chuyên môn thuộc EduConnect; chức vụ BCH chỉ cấp quyền quản trị Cổng Đoàn.</p></div>
    <form className="flex gap-2"><input className={inputCls} name="q" defaultValue={q} placeholder="Tìm họ tên, email, tên đăng nhập" /><button className="rounded border px-4">Tìm</button></form>
    <Card className="space-y-3"><h2 className="font-semibold">Tạo tài khoản BCH riêng</h2><p className="text-sm text-slate-600">Dành cho học sinh tham gia BCH hoặc người chưa có tài khoản giáo viên. Không liên kết hay thay đổi tài khoản học sinh.</p>
      <ActionForm action={createStandaloneUnionAccount} submit="Tạo BCH riêng">
        <input name="fullName" required minLength={2} maxLength={100} placeholder="Họ tên" className={inputCls} />
        <input name="username" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" placeholder="Tên đăng nhập BCH" className={inputCls} />
        <input name="position" required minLength={2} maxLength={60} placeholder="Chức danh BCH" className={inputCls} />
      </ActionForm>
    </Card>
    {standalone.map((a) => <Card key={a.id} className="space-y-3"><h2 className="font-semibold">{a.fullName} · BCH riêng</h2><p className="text-sm text-slate-600">{a.username} · {a.status === "ACTIVE" ? "Đang hoạt động" : "Đang khóa"}</p>
      <ActionForm action={manageStandaloneUnionAccount} submit="Lưu chức danh" reset={false}><input type="hidden" name="accountId" value={a.id} /><input type="hidden" name="command" value="save" /><input name="position" defaultValue={a.position ?? ""} required minLength={2} maxLength={60} className={inputCls} /></ActionForm>
      <div className="flex flex-wrap gap-2"><ActionForm action={manageStandaloneUnionAccount} submit={a.status === "ACTIVE" ? "Khóa BCH riêng" : "Mở khóa BCH riêng"}><input type="hidden" name="accountId" value={a.id} /><input type="hidden" name="command" value={a.status === "ACTIVE" ? "lock" : "unlock"} /></ActionForm><ActionForm action={manageStandaloneUnionAccount} submit="Cấp lại mật khẩu BCH" confirmText="Chỉ đổi mật khẩu BCH riêng; tài khoản học sinh giữ nguyên."><input type="hidden" name="accountId" value={a.id} /><input type="hidden" name="command" value="reset" /></ActionForm></div>
    </Card>)}
    {staff.length === 0 && <Card>Không tìm thấy nhân sự.</Card>}
    {staff.map((u) => <Card key={u.id} className="space-y-3">
      <div><Link className="font-semibold text-orange-700" href={`/tai-khoan/${u.id}?tab=roles`}>{u.teacher?.fullName ?? u.account.fullName}</Link>
        <p className="text-sm text-slate-500">{u.account.username} · {u.email}</p></div>
      <div className="flex flex-wrap gap-2">{u.roles.map((r) => <span key={r} className="rounded bg-slate-100 px-2 py-1 text-xs">{ROLE_LABEL[r]}</span>)}</div>
      <Link href={`/tai-khoan/${u.id}?tab=roles`} className="block text-sm text-orange-700">Sửa vai trò EduConnect →</Link>
      <p className="text-sm">Cổng Đoàn: {u.account.role === "ADMIN" ? (u.account.position ?? "Quản trị") : "Chưa được phân công BCH"}</p>
      {u.teacher && !u.account.superAdmin && ["ADMIN", "EXTERNAL"].includes(u.account.role) ? <>
        <ActionForm action={assignUnionLeader} submit="Lưu phân công BCH" reset={false} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="accountId" value={u.accountId} />
          <select name="position" defaultValue={u.account.role === "ADMIN" ? u.account.position ?? "" : ""} className={inputCls}>
            <option value="">Không tham gia BCH / Thu hồi quyền</option>
            {[...new Set(["Bí thư Đoàn trường", "Phó Bí thư Đoàn trường", "Ủy viên Ban Thường vụ Đoàn trường", "Ủy viên Ban chấp hành Đoàn trường", ...(u.account.position ? [u.account.position] : [])])].map((p) => <option key={p}>{p}</option>)}
          </select>
        </ActionForm>
        {(!u.isActive || u.account.status !== "ACTIVE") && <ActionForm action={assignUnionLeader} submit="Thu hồi quyền BCH" confirmText="Thu hồi quyền BCH của nhân sự này?"><input type="hidden" name="accountId" value={u.accountId} /></ActionForm>}
      </> : <p className="text-xs text-slate-500">Cần hồ sơ giáo viên để bổ nhiệm BCH trên tài khoản này.</p>}
    </Card>)}
  </div>;
}
