import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import type { Scope } from "@/modules/apikeys/api-key.scopes";
import { ApiError } from "../public-api.service";

/** Người thực hiện giả lập cho các quy tắc nghiệp vụ hiện có (cần quyền quản lý); email dạng "api:<tên khoá>" để nhật ký thể hiện rõ là hệ thống ngoài. */
export const apiActor = (key: { id: string; name: string }): SessionUser => ({ userId: `api:${key.id}`, email: `api:${key.name}`, roles: ["ADMIN"], teacherId: null, studentId: null });

/** Các nhóm trường bắt buộc có quyền riêng: gửi trường mà khoá không có quyền thì từ chối cả yêu cầu (không ghi dở). */
export function requireScopes(have: ReadonlySet<Scope>, needs: { scope: Scope; why: string }[]) {
  const missing = needs.filter((n) => !have.has(n.scope));
  if (missing.length) throw new ApiError(403, "insufficient_scope", `Khoá API chưa được cấp quyền: ${missing.map((m) => `${m.scope} (${m.why})`).join("; ")}.`, { required: missing.map((m) => m.scope) });
}

/** Lỗi nghiệp vụ của các hàm có sẵn (ném Error tiếng Việt) → 409 business_rule với đúng thông điệp. */
export async function rule<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.constructor === Error) throw new ApiError(409, "business_rule", error.message);
    throw error;
  }
}

export const toDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const fromDay = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
export type Tx = Prisma.TransactionClient;

export async function audit(actorEmail: string, action: string, targetType: string, targetId: string) {
  await prisma.activityLog.create({ data: { actorEmail, action, targetType, targetId } });
}

/** Chỉ giữ các trường thật sự đổi giá trị (so sánh sau khi chuẩn hoá). */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) { b[k] = before[k] ?? null; a[k] = after[k] ?? null; }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
