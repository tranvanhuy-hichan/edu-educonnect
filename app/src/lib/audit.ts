import { db } from "@/lib/db";

/** Ghi nhật ký hoạt động (hiện ở /nhat-ky). Gọi sau mỗi thao tác quan trọng: tạo/sửa/xoá, khoá tài khoản, đặt lại mật khẩu, lên lớp... */
export async function audit(actorEmail: string, action: string, targetType: string, targetId?: string) {
  await db.activityLog.create({ data: { actorEmail, action, targetType, targetId } });
}
