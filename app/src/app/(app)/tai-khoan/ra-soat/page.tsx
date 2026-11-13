import { AccountTabs } from "@/components/account-tabs";
import Link from "next/link";
import { requireRole, ADMIN_ROLES } from "@/lib/guard";
import { ROLE_LABEL } from "@/lib/nav";
import { Card, Table, Title } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { accountReview, STALE_DAYS, type ReviewRow } from "@/modules/admin/account-review.service";
import { lockReviewedAccounts } from "./actions";

export const dynamic = "force-dynamic";
const fmt = (d: Date | null) => (d ? d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "chưa từng");

function Section({ title, hint, rows, lockable = true }: { title: string; hint: string; rows: ReviewRow[]; lockable?: boolean }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title} ({rows.length})</h2>
      <p className="text-sm text-slate-500">{hint}</p>
      {rows.length ? (
        <ActionForm action={lockReviewedAccounts} submit="Khoá các tài khoản đã chọn" danger reset={false} className="flex flex-col gap-3" confirmText="Khoá các tài khoản đã chọn và đăng xuất họ khỏi mọi thiết bị?">
          <Table head={lockable ? ["Khoá", "Tài khoản", "Vai trò", "Đăng nhập gần nhất", "Tạo lúc"] : ["Tài khoản", "Vai trò", "Đăng nhập gần nhất", "Tạo lúc"]}>
            {rows.map((r) => (
              <tr key={r.id}>
                {lockable && <td><input type="checkbox" name="ids" value={r.id} className="size-4" aria-label={`Chọn ${r.name}`} /></td>}
                <td><Link href={`/tai-khoan/${r.id}`} className="font-medium hover:text-orange-700">{r.name}</Link><div className="text-xs text-slate-500">{r.email}</div></td>
                <td className="text-xs">{r.roles.map((x) => ROLE_LABEL[x as keyof typeof ROLE_LABEL] ?? x).join(", ")}</td>
                <td className="whitespace-nowrap text-xs">{fmt(r.lastLoginAt)}</td>
                <td className="whitespace-nowrap text-xs">{fmt(r.createdAt)}</td>
              </tr>
            ))}
          </Table>
        </ActionForm>
      ) : <p className="rounded-lg border bg-white p-4 text-center text-sm text-slate-500">Không có tài khoản nào.</p>}
    </section>
  );
}

export default async function AccountReviewPage() {
  const me = await requireRole(...ADMIN_ROLES);
  const r = await accountReview(me);
  return (
    <div className="space-y-6"><AccountTabs current="/tai-khoan/bao-mat" />
      <Title>Rà soát tài khoản</Title>
      <Card className="space-y-1 text-sm text-slate-600">
        <p>Liệt kê tài khoản có dấu hiệu không còn sử dụng để bạn quyết định khoá, giảm rủi ro bảo mật. Hệ thống <b>không tự khoá</b> ai. Khoá xong vẫn mở lại được và dữ liệu được giữ nguyên.</p>
        <p>Ngày 1 hằng tháng hệ thống sẽ nhắc bạn rà soát. Học sinh không có trong danh sách “lâu không đăng nhập” vì học sinh có thể không đăng nhập thường xuyên.</p>
        {!r.trackingReady && <p className="font-medium text-amber-700">Hệ thống mới bắt đầu ghi nhận lần đăng nhập{r.trackingSince ? ` từ ${fmt(r.trackingSince)}` : ""}. Mục “chưa từng đăng nhập” sẽ hiển thị sau khi đã ghi nhận đủ 30 ngày.</p>}
      </Card>
      <Section title={`Lâu không đăng nhập (trên ${STALE_DAYS} ngày)`} hint="Cán bộ, giáo viên đã đăng nhập trước đây nhưng không còn dùng." rows={r.stale} />
      {r.trackingReady && <Section title="Chưa từng đăng nhập (tạo trên 30 ngày)" hint="Tài khoản được cấp nhưng chưa ai dùng: có thể cấp thừa, hoặc người dùng chưa nhận được mật khẩu." rows={r.neverLoggedIn} />}
      <Section title="Giáo viên chưa có phân công" hint="Không dạy lớp nào và không chủ nhiệm trong năm học hiện hành: có thể đã nghỉ việc hoặc chưa được phân công." rows={r.idleTeachers} />
      <Section title="Học sinh chưa xếp lớp năm học này" hint="Có thể đã ra trường hoặc thôi học. Nên khoá tài khoản thay vì xoá để giữ lịch sử học tập." rows={r.leftStudents} />
      <Section title="Đang bị khoá tạm do nhập sai mật khẩu" hint="Mở khoá sớm ở trang chi tiết tài khoản nếu đúng là chủ tài khoản." rows={r.locked} lockable={false} />
    </div>
  );
}
