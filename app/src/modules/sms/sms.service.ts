import { createHmac } from "node:crypto";
import { logger } from "@/lib/logger";
import { currentProvider } from "./provider";
import { maskPhone, toAscii, toVnMobile } from "./phone";
import * as repo from "./sms.repository";

export const SMS_EVENTS = ["score_changed", "grades_published", "absence"] as const;
export type SmsEvent = (typeof SMS_EVENTS)[number];
export type SendOutcome = { ok: boolean; status: "SENT" | "FAILED" | "SKIPPED"; error?: string };

const int = (v: string | undefined, d: number) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : d; };
const DAY_MS = 86_400_000;

/** Sự kiện nào được gửi SMS (ngoài thông báo trong ứng dụng). Đặt SMS_EVENTS="absence,grades_published" để tiết kiệm chi phí; mặc định gửi tất cả. */
export function smsEventEnabled(event: SmsEvent, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!currentProvider(env)) return false;
  const configured = (env.SMS_EVENTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return configured.length === 0 || configured.includes(event);
}

/** Băm số điện thoại để đếm hạn mức mà không lưu số rõ. */
export const hashPhone = (phone: string) => createHmac("sha256", process.env.JWT_SECRET ?? "dev-only").update(`sms:${phone}`).digest("hex");

/**
 * Gửi một tin SMS, ghi nhật ký (không lưu số rõ, không lưu nội dung). KHÔNG BAO GIỜ ném lỗi.
 * Chặn: SMS chưa bật, số không hợp lệ, vượt hạn mức ngày toàn trường (SMS_DAILY_LIMIT, mặc định 3000)
 * và vượt hạn mức thông báo cho một số/ngày (SMS_PHONE_DAILY_LIMIT, mặc định 5; mã OTP không bị giới hạn này).
 */
export async function sendSms(purpose: "OTP" | "NOTICE", rawPhone: string, text: string): Promise<SendOutcome> {
  const provider = currentProvider();
  if (!provider) return { ok: false, status: "SKIPPED", error: "SMS chưa được kích hoạt" };
  const phone = toVnMobile(rawPhone);
  const base = { purpose, provider: provider.name, phoneHash: hashPhone(phone ?? rawPhone.replace(/\D/g, "")), phoneMasked: phone ? maskPhone(phone) : "invalid" } as const;
  const skip = async (error: string): Promise<SendOutcome> => { await repo.insertSmsLog({ ...base, status: "SKIPPED", error }).catch(() => undefined); return { ok: false, status: "SKIPPED", error }; };
  try {
    if (!phone) return await skip("Số điện thoại không hợp lệ");
    const since = new Date(Date.now() - DAY_MS);
    if ((await repo.countSentSince(since)) >= int(process.env.SMS_DAILY_LIMIT, 3000)) return await skip("Đã chạm hạn mức SMS trong ngày của toàn trường");
    if (purpose === "NOTICE" && (await repo.countNoticesToPhoneSince(base.phoneHash, since)) >= int(process.env.SMS_PHONE_DAILY_LIMIT, 5)) return await skip("Số này đã nhận đủ số tin SMS thông báo trong ngày");
    const result = await provider.send(phone, toAscii(text).slice(0, purpose === "OTP" ? 320 : 160));
    await repo.insertSmsLog({ ...base, status: result.ok ? "SENT" : "FAILED", providerCode: result.code, providerRef: result.ref, error: result.error });
    return result.ok ? { ok: true, status: "SENT" } : { ok: false, status: "FAILED", error: result.error };
  } catch (error) {
    logger.error({ err: error }, "sms_send_failed");
    return { ok: false, status: "FAILED", error: "Lỗi hệ thống khi gửi SMS" };
  }
}

/**
 * Gộp theo số điện thoại: một phụ huynh có nhiều con/nhiều thông báo cùng lúc chỉ nhận MỘT tin
 * (một tin riêng nếu chỉ có một thông báo, ngược lại là tin tóm tắt kèm tên các em).
 */
export function groupNoticeSms(items: { phone: string; text: string; childName: string }[], school: string): { phone: string; text: string }[] {
  const by = new Map<string, typeof items>();
  for (const it of items) {
    const key = toVnMobile(it.phone);
    if (!key) continue;
    by.set(key, [...(by.get(key) ?? []), it]);
  }
  return [...by.entries()].map(([phone, list]) => ({
    phone,
    text: list.length === 1 ? list[0].text : `[${school}] Co ${list.length} thong bao moi cho ${[...new Set(list.map((l) => l.childName))].join(", ")}. Xem So lien lac dien tu de biet chi tiet.`,
  }));
}
