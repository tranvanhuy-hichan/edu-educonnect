import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/session";
import { ActionForm } from "@/components/action-form";
import { Field, inputCls } from "@/components/ui";
import { requestUnlock, reviewUnlock } from "../unlock-actions";

export async function LockControls({ assignmentId, user, locked }: { assignmentId: string; user: SessionUser; locked: boolean }) {
  const requests = await db.scoreUnlockRequest.findMany({ where: { assignmentId, ...(isAdmin(user) ? {} : { requestedBy: user.userId }) }, orderBy: { createdAt: "desc" }, take: 15 });
  if (!locked && !requests.length) return null;
  const labels = { SUBMITTED: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối", DRAFT: "Nháp" };
  return <section className="content-panel space-y-3 rounded-xl border bg-white p-4">
    <h2 className="font-semibold">Kiểm soát sửa điểm đã khóa</h2>
    <p className="text-xs text-slate-500">Quyền sửa giới hạn theo người yêu cầu và lớp và môn, tối đa 72 giờ. Một quản lý khác phê duyệt; mọi thay đổi lưu giá trị trước/sau và lý do.</p>
    {locked && <ActionForm action={requestUnlock} submit="Gửi yêu cầu" reset={false} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Field label="Lý do sửa"><input required minLength={10} maxLength={2000} name="reason" className={inputCls + " w-full sm:w-80"} /></Field>
      <Field label="Thời hạn (giờ)"><input required type="number" min={1} max={72} name="durationHours" defaultValue={24} className={inputCls + " w-24"} /></Field>
    </ActionForm>}
    {requests.map((request) => <div key={request.id} className="space-y-2 border-t pt-3 text-xs">
      <p><b>{request.requesterEmail}</b> · {labels[request.status]} · {request.durationHours} giờ</p><p>{request.reason}</p>
      {request.expiresAt && <p>Quyền sửa đến: {request.expiresAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>}
      {request.reviewedBy && <p>{request.reviewedBy}: {request.reviewReason}</p>}
      {isAdmin(user) && request.status === "SUBMITTED" && request.requestedBy !== user.userId && <ActionForm action={reviewUnlock} submit="Xác nhận" reset={false} className="flex flex-wrap gap-2">
        <input type="hidden" name="requestId" value={request.id} />
        <select name="approve" className={inputCls}><option value="false">Từ chối</option><option value="true">Phê duyệt</option></select>
        <input required minLength={10} maxLength={2000} name="reason" placeholder="Lý do xử lý" className={inputCls + " flex-1"} />
      </ActionForm>}
    </div>)}
  </section>;
}
