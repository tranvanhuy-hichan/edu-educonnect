import { db } from "@/lib/db";
import { AutoForm } from "@/components/auto-form";
import { requireRole, ADMIN_ROLES } from "@/lib/guard";
import { inputCls, Table, Tabs, Title } from "@/components/ui";
import { MobileCollapse } from "@/components/mobile-collapse";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";

const ACTION_LABEL: Record<string, string> = {
  create_exam: "Tạo lịch thi", update_exam: "Sửa lịch thi", publish_exam: "Công bố lịch thi", withdraw_exam: "Thu hồi lịch thi", cancel_exam: "Hủy lịch thi",
  create_user: "Tạo tài khoản", update_user_roles: "Sửa vai trò", activate_user: "Mở khoá tài khoản", deactivate_user: "Khoá tài khoản",
  reset_password: "Đặt lại mật khẩu", change_password: "Đổi mật khẩu", settings: "Đổi cấu hình", create: "Thêm mới", update: "Cập nhật", delete: "Xoá",
};
const TYPE_LABEL: Record<string, string> = {
  ExamEvent: "Lịch thi",
  User: "Tài khoản", Teacher: "Giáo viên", Student: "Học sinh", SchoolClass: "Lớp học", Room: "Phòng học", Subject: "Môn học",
  ClassSubjectAssignment: "Phân công", TimetableSlot: "Thời khóa biểu", ClassPeriodLog: "Sổ đầu bài", ScoreEntry: "Điểm số",
  AcademicYear: "Năm học", AcademicTerm: "Học kỳ", GradeLevel: "Khối lớp", ScoreWeightConfig: "Hệ số điểm", LibraryLoan: "Mượn sách",
};
const label = (m: Record<string, string>, k: string) => m[k] ?? k;
const fmtTime = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
// Ngày lọc tính theo giờ Việt Nam
const dayStart = (s: string) => new Date(`${s}T00:00:00+07:00`);

export default async function ActivityLog({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; action?: string; from?: string; to?: string; page?: string; size?: string }> }) {
  await requireRole(...ADMIN_ROLES);
  const sp = await searchParams;
  const { q = "", tab = "all", action = "", from = "", to = "" } = sp;
  const pg = getPaging(sp);

  const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(dayStart(s).getTime());
  const createdAt = {
    ...(validDate(from) ? { gte: dayStart(from) } : {}),
    ...(validDate(to) ? { lt: new Date(dayStart(to).getTime() + 86400_000) } : {}),
  };
  // người + hành động + khoảng ngày áp dụng trước, số đếm ở các tab phản ánh đúng kết quả đã lọc
  const base = {
    ...(q.trim() ? { actorEmail: { contains: q.trim(), mode: "insensitive" as const } } : {}),
    ...(action ? { action } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };
  const [types, actions, total, logs] = await Promise.all([
    db.activityLog.groupBy({ by: ["targetType"], where: base, _count: true, orderBy: { targetType: "asc" } }),
    db.activityLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    db.activityLog.count({ where: { ...base, ...(tab === "all" ? {} : { targetType: tab }) } }),
    db.activityLog.findMany({ where: { ...base, ...(tab === "all" ? {} : { targetType: tab }) }, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take }),
  ]);
  const all = types.reduce((n, t) => n + t._count, 0);
  const params = { q, tab, action, from, to, size: sp.size };
  const href = (k: string) => `/nhat-ky?tab=${encodeURIComponent(k)}&q=${encodeURIComponent(q)}&action=${encodeURIComponent(action)}&from=${from}&to=${to}`;

  return (
    <div className="space-y-4">
      <Title>Nhật ký hoạt động ({all})</Title>
      <Tabs current={href(tab)} items={[[href("all"), `Tất cả (${all})`] as [string, string], ...types.map((t) => [href(t.targetType), `${label(TYPE_LABEL, t.targetType)} (${t._count})`] as [string, string])]} />
      <AutoForm className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={q} placeholder="Tìm theo người thực hiện (email)..." className={inputCls + " min-w-0 flex-1 md:min-w-48"} />
        <MobileCollapse active={[action, from, to].filter(Boolean).length}>
          <select name="action" defaultValue={action} className={inputCls + " max-w-56"}><option value="">Mọi hành động</option>{actions.map((a) => <option key={a.action} value={a.action}>{label(ACTION_LABEL, a.action)}</option>)}</select>
          <input type="date" name="from" defaultValue={from} className={inputCls} aria-label="Từ ngày" title="Từ ngày" />
          <input type="date" name="to" defaultValue={to} className={inputCls} aria-label="Đến ngày" title="Đến ngày" />
        </MobileCollapse>
      </AutoForm>
      <Table head={["Thời gian", "Người thực hiện", "Hành động", "Đối tượng"]}>
        {logs.map((l) => (
          <tr key={l.id} className="align-middle [&>td]:!py-3">
            <td className="whitespace-nowrap">{fmtTime(l.createdAt)}</td>
            <td>{l.actorEmail}</td>
            <td><span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">{label(ACTION_LABEL, l.action)}</span></td>
            <td>{label(TYPE_LABEL, l.targetType)}{l.targetId ? <span className="text-xs text-slate-500"> · {l.targetId.slice(0, 8)}</span> : null}</td>
          </tr>
        ))}
        {!logs.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Chưa có hoạt động phù hợp.</td></tr>}
      </Table>
      <Pagination total={total} page={pg.page} size={pg.size} path="/nhat-ky" params={params} />
    </div>
  );
}
