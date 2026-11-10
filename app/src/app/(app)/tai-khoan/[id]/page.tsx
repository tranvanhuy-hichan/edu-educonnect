import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, GraduationCap, KeyRound, Mail, MoreHorizontal, School, ShieldCheck, UserRound } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, ADMIN_ROLES, type Role } from "@/lib/guard";
import { ROLE_LABEL } from "@/lib/nav";
import { ActionForm } from "@/components/action-form";
import { Card, Table, Tabs } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { fmtDate } from "@/lib/format";
import { getPaging } from "@/lib/paging";
import { resetAccountPassword, toggleAccount, updateAccountRoles } from "../actions";

const TABS = [["overview", "Tổng quan"], ["roles", "Vai trò"], ["security", "Bảo mật"], ["activity", "Nhật ký"]] as const;
const TEACHER_ROLES: Role[] = ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"];
const STAFF_ROLES_EDIT: Role[] = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN"];

const fmtTime = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });

const Stat = ({ icon: I, label, value, tone = "bg-orange-100 text-orange-700", vt = "" }: { icon: typeof Mail; label: string; value: React.ReactNode; tone?: string; vt?: string }) => (
  <Card className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
    <span className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}><I className="size-4 sm:size-5" /></span>
    <div className="min-w-0"><div className="text-xs leading-tight text-slate-500">{label}</div><div className={`truncate text-lg font-bold sm:text-xl ${vt}`}>{value}</div></div>
  </Card>
);

export default async function AccountDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ap?: string; size?: string }> }) {
  const me = await requireRole(...ADMIN_ROLES);
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";

  const u = await db.user.findUnique({
    where: { id },
    include: {
      teacher: { select: { id: true, fullName: true, code: true, phone: true, homeroomClasses: { select: { id: true, className: true } }, _count: { select: { assignments: true } } } },
      student: { select: { id: true, fullName: true, code: true, enrollments: { take: 1, orderBy: { academicYear: { startDate: "desc" } }, select: { schoolClass: { select: { id: true, className: true } } } } } },
    },
  });
  if (!u) notFound();

  const name = u.teacher?.fullName ?? u.student?.fullName ?? u.email;
  const logWhere = { OR: [{ targetId: id }, { actorEmail: u.email }] };
  const ap = getPaging({ size: sp.size, page: sp.ap }, 15);
  const [logTotal, logs] = tab === "activity"
    ? await Promise.all([db.activityLog.count({ where: logWhere }), db.activityLog.findMany({ where: logWhere, orderBy: { createdAt: "desc" }, skip: ap.skip, take: ap.take })])
    : [0, []];
  const isSelf = u.id === me.id;
  const hue = [...u.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  const cls = u.student?.enrollments[0]?.schoolClass;



  return (
    <div className="space-y-4">
      {/* ===== Đầu trang: hồ sơ tóm tắt + thao tác ===== */}
      <Card mobile="flat" className="detail-header flex flex-wrap items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full text-2xl font-bold" style={{ background: `hsl(${hue} 70% 90%)`, color: `hsl(${hue} 60% 25%)` }}>{name.split(" ").pop()?.[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{name}</h1>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{u.student?.code ?? u.teacher?.code ?? "Tài khoản"}</span>
            <span className={`text-sm font-medium ${u.isActive ? "text-green-700" : "text-red-600"}`}>{u.isActive ? "Hoạt động" : "Đã khoá"}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="flex items-center gap-1"><Mail className="size-4" />{u.email}</span>
            {u.teacher && <span className="flex items-center gap-1"><UserRound className="size-4" />Giáo viên{u.teacher.phone ? ` · ${u.teacher.phone}` : ""}</span>}
            {cls && <span className="flex items-center gap-1"><GraduationCap className="size-4" />Lớp {cls.className}</span>}
          </div>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto md:flex-wrap">
          <ActionForm action={toggleAccount} submit={u.isActive ? "Khoá tài khoản" : "Mở khoá tài khoản"} danger={u.isActive} confirmText={u.isActive ? "Khoá tài khoản này?" : undefined} className="flex min-w-0 flex-1 md:flex-none [&>button]:w-full md:[&>button]:w-auto">
            <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="lock" value={u.isActive ? "1" : "0"} />
          </ActionForm>
          <details className="relative min-w-0 flex-1 md:flex-none">
            <summary className="inline-flex h-9 w-full cursor-pointer list-none items-center justify-center gap-1 rounded-md border bg-white px-3 text-sm hover:bg-slate-50 md:w-auto"><MoreHorizontal className="size-4" /> Khác</summary>
            <div className="absolute right-0 z-20 mt-1 w-56 space-y-1 rounded-md border bg-white p-2 shadow-lg">
              <ActionForm action={resetAccountPassword} submit="Cấp lại mật khẩu" reset={false} confirmText="Cấp lại mật khẩu cho tài khoản này?" className="flex flex-col items-stretch gap-1 [&>button]:w-full [&>button]:justify-self-stretch"><input type="hidden" name="userId" value={u.id} /></ActionForm>
              {u.teacher && <Link href={`/giao-vien/${u.teacher.id}`} className="block rounded-md px-3 py-2 text-center text-sm hover:bg-slate-50">Xem hồ sơ giáo viên</Link>}
              {u.student && <Link href={`/hoc-sinh/${u.student.id}`} className="block rounded-md px-3 py-2 text-center text-sm hover:bg-slate-50">Xem hồ sơ học sinh</Link>}
            </div>
          </details>
        </div>
      </Card>

      <Tabs current={`?tab=${tab}`} items={TABS.map(([k, l]) => [`?tab=${k}`, l] as [string, string])} />

      {/* ===== Tổng quan ===== */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat icon={ShieldCheck} label="Vai trò" value={u.roles.length} />
            <Stat icon={KeyRound} label="Mật khẩu" value={u.mustChangePwd ? "Chưa đổi" : "Đã đổi"} tone="bg-sky-100 text-sky-700" vt={u.mustChangePwd ? "text-yellow-700" : ""} />
            <Stat icon={u.student ? GraduationCap : School} label={u.student ? "Lớp đang học" : "Lớp chủ nhiệm"} value={u.student ? (cls?.className ?? "—") : (u.teacher?.homeroomClasses.length ?? "—")} tone="bg-green-100 text-green-700" />
            <Stat icon={CalendarDays} label="Ngày tạo" value={fmtDate(u.createdAt)} tone="bg-yellow-100 text-yellow-700" />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="p-0 xl:col-span-2">
              <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Vai trò</h2><Link href="?tab=roles" className="text-sm text-orange-700 hover:underline">Chỉnh sửa →</Link></div>
              <ul className="divide-y text-sm">
                {u.roles.map((r) => <li key={r} className="flex items-center justify-between px-4 py-3"><b>{ROLE_LABEL[r]}</b><span className="text-xs text-slate-500">{r}</span></li>)}
              </ul>
            </Card>
            <Card className="p-0">
              <div className="border-b px-4 py-3"><h2 className="font-semibold">Hồ sơ liên kết</h2></div>
              <ul className="divide-y text-sm">
                {u.teacher && <li className="space-y-1 px-4 py-3"><Link href={`/giao-vien/${u.teacher.id}`} className="font-medium text-orange-700 hover:underline">{u.teacher.fullName}</Link><div className="text-xs text-slate-500">Giáo viên · {u.teacher.code ?? "chưa có mã"} · {u.teacher._count.assignments} phân công{u.teacher.homeroomClasses.length ? ` · chủ nhiệm ${u.teacher.homeroomClasses.map((c) => c.className).join(", ")}` : ""}</div></li>}
                {u.student && <li className="space-y-1 px-4 py-3"><Link href={`/hoc-sinh/${u.student.id}`} className="font-medium text-orange-700 hover:underline">{u.student.fullName}</Link><div className="text-xs text-slate-500">Học sinh · {u.student.code ?? "chưa có mã"}{cls ? ` · lớp ${cls.className}` : ""}</div></li>}
                {!u.teacher && !u.student && <li className="px-4 py-8 text-center text-slate-500">Tài khoản quản lý, không gắn hồ sơ giáo viên/học sinh.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* ===== Vai trò ===== */}
      {tab === "roles" && (
        <Card mobile="flat">
          <h2 className="mb-1 font-semibold">Vai trò của tài khoản</h2>
          <p className="mb-3 text-sm text-slate-600">Một người có thể giữ nhiều vai trò (vd GVCN kiêm GVBM) và sẽ thấy gộp menu của các vai trò đó. Vai trò giáo viên cần có hồ sơ giáo viên; vai trò học sinh gắn với hồ sơ học sinh nên không đổi ở đây.</p>
          <ActionForm action={updateAccountRoles} submit="Lưu vai trò" reset={false} className="flex flex-col gap-3 [&>button]:self-start">
            <input type="hidden" name="userId" value={u.id} />
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {u.roles.includes("STUDENT") && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked disabled className="size-4" /><input type="hidden" name="roles" value="STUDENT" /> {ROLE_LABEL.STUDENT}</label>}
              {STAFF_ROLES_EDIT.map((r) => {
                const noProfile = TEACHER_ROLES.includes(r) && !u.teacher;
                const lockSelf = r === "ADMIN" && isSelf;
                return (
                  <label key={r} className={`flex items-center gap-2 text-sm ${noProfile ? "opacity-50" : ""}`}>
                    <input type="checkbox" name="roles" value={r} defaultChecked={u.roles.includes(r)} disabled={noProfile || lockSelf} className="size-4" /> {ROLE_LABEL[r]}
                    {lockSelf && <input type="hidden" name="roles" value="ADMIN" />}
                  </label>
                );
              })}
            </div>
            {!u.teacher && !u.student && <p className="text-xs text-slate-500">Muốn gán vai trò giáo viên, hãy tạo hồ sơ giáo viên ở mục Giáo viên trước.</p>}
          </ActionForm>
        </Card>
      )}

      {/* ===== Bảo mật ===== */}
      {tab === "security" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card mobile="flat" className="space-y-3">
            <h2 className="font-semibold">Đặt lại mật khẩu</h2>
            <p className="text-sm text-slate-600">Hệ thống sinh mật khẩu ngẫu nhiên và chỉ hiện <b>một lần</b>. Người dùng bị bắt đổi mật khẩu khi đăng nhập kế tiếp.</p>
            <ActionForm action={resetAccountPassword} submit="Cấp lại mật khẩu" reset={false} confirmText="Cấp lại mật khẩu cho tài khoản này?" className="flex flex-col gap-2 [&>button]:self-start"><input type="hidden" name="userId" value={u.id} /></ActionForm>
            <div className="border-t pt-3 text-sm text-slate-600">Trạng thái mật khẩu: <b>{u.mustChangePwd ? "Chưa đổi (đang dùng mật khẩu được cấp)" : "Người dùng đã tự đổi"}</b></div>
          </Card>
          <Card mobile="flat" className="space-y-3">
            <h2 className="font-semibold">Khoá / mở khoá tài khoản</h2>
            <p className="text-sm text-slate-600">Tài khoản bị khoá không thể đăng nhập và phiên đang mở bị vô hiệu ngay. Dữ liệu và hồ sơ được giữ nguyên.</p>
            <ActionForm action={toggleAccount} submit={u.isActive ? "Khoá tài khoản" : "Mở khoá tài khoản"} danger={u.isActive} confirmText={u.isActive ? "Khoá tài khoản này?" : undefined} className="flex flex-col gap-2 [&>button]:self-start">
              <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="lock" value={u.isActive ? "1" : "0"} />
            </ActionForm>
            {isSelf && <p className="text-xs text-slate-500">Đây là tài khoản của bạn nên không thể tự khoá.</p>}
          </Card>
        </div>
      )}

      {/* ===== Nhật ký ===== */}
      {tab === "activity" && (
        <>
          <Table head={["Thời gian", "Người thực hiện", "Hành động", "Đối tượng"]}>
            {logs.map((l) => <tr key={l.id}><td>{fmtTime(l.createdAt)}</td><td>{l.actorEmail}</td><td>{l.action}</td><td>{l.targetType}{l.targetId ? ` · ${l.targetId.slice(0, 8)}` : ""}</td></tr>)}
            {!logs.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Chưa có hoạt động nào liên quan tới tài khoản này.</td></tr>}
          </Table>
          <Pagination total={logTotal} page={ap.page} size={ap.size} path={`/tai-khoan/${id}`} params={{ tab: "activity", size: sp.size }} pageKey="ap" />
        </>
      )}
    </div>
  );
}
