import * as repo from "./parent-notification.repository";
import { enqueue, kickSoon } from "@/lib/jobs/queue";
import { groupNoticeSms, smsEventEnabled, type SmsEvent } from "@/modules/sms/sms.service";
import { toAscii } from "@/modules/sms/phone";

const SMS_BATCH = 40;

/**
 * Khoá ghép phụ huynh ↔ học sinh: 9 số cuối của SĐT người giám hộ (đã bỏ ký tự không phải số, đổi +84 thành 0).
 * Trùng với cách trang /phu-huynh tìm các con của một phụ huynh. Ít hơn 7 số → không hợp lệ.
 */
export function phoneKeyOf(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length > 9) digits = "0" + digits.slice(2);
  return digits.length >= 7 ? digits.slice(-9) : null;
}

export type GuardianTarget = { id: string; fullName: string; guardianPhone: string | null };
export type GuardianNotice = { title: string; content: string; type: "GRADE" | "ATTENDANCE" | "SYSTEM" | "ASSIGNMENT" | "EXAM" | "LIBRARY"; link?: string; /** Bản ngắn gửi SMS (không dấu, ≤160 ký tự). Bỏ trống = không gửi SMS cho thông báo này. */ sms?: string };

/** Ghi thông báo cho phụ huynh của từng học sinh. Học sinh chưa có SĐT người giám hộ hợp lệ thì bỏ qua (được đếm trong skipped). */
export async function notifyGuardians(students: GuardianTarget[], build: (student: GuardianTarget) => GuardianNotice, opts: { smsEvent?: SmsEvent; school?: string } = {}) {
  const rows: repo.ParentNoticeRow[] = [];
  const smsItems: { phone: string; text: string; childName: string }[] = [];
  let skipped = 0;
  for (const s of students) {
    const phoneKey = phoneKeyOf(s.guardianPhone);
    if (!phoneKey) { skipped++; continue; }
    const n = build(s);
    rows.push({ phoneKey, studentId: s.id, title: n.title, content: n.content, type: n.type, link: n.link ?? `/phu-huynh?child=${s.id}` });
    if (n.sms && s.guardianPhone) smsItems.push({ phone: s.guardianPhone, text: n.sms, childName: toAscii(s.fullName) });
  }
  if (rows.length) await repo.insertParentNotices(rows);
  // SMS đi kèm thông báo trong ứng dụng: chỉ khi đã bật SMS và sự kiện này được phép. Gửi qua hàng đợi nên không làm chậm thao tác của giáo viên.
  let sms = 0;
  if (opts.smsEvent && smsItems.length && smsEventEnabled(opts.smsEvent)) {
    const messages = groupNoticeSms(smsItems, toAscii(opts.school ?? "Truong"));
    for (let i = 0; i < messages.length; i += SMS_BATCH) await enqueue("sms.send", { items: messages.slice(i, i + SMS_BATCH) }, { maxAttempts: 2 });
    sms = messages.length;
    kickSoon();
  }
  return { sent: rows.length, skipped, sms };
}

export const listParentNotifications = (phone: string, limit = 20) => { const k = phoneKeyOf(phone); return k ? repo.parentNoticesFor(k, limit) : Promise.resolve([]); };
export const countParentUnread = (phone: string) => { const k = phoneKeyOf(phone); return k ? repo.parentUnread(k) : Promise.resolve(0); };
export const markParentRead = (id: string, phone: string) => { const k = phoneKeyOf(phone); return k ? repo.parentReadOne(id, k) : Promise.resolve({ count: 0 }); };
export const markAllParentRead = (phone: string) => { const k = phoneKeyOf(phone); return k ? repo.parentReadAll(k) : Promise.resolve({ count: 0 }); };
