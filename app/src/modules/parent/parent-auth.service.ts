import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { isSmsEnabled } from "@/modules/sms/provider";
import { sendSms } from "@/modules/sms/sms.service";
import { maskPhone, toVnMobile } from "@/modules/sms/phone";
import { phoneKeyOf } from "@/modules/notification/parent-notification.service";
import * as repo from "./parent-account.repository";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const DEFAULT_PARENT_PASSWORD = "123456";

export type Guardian = { phone: string; key: string; name: string | null };
type Fail = { ok: false; error: string };

const secret = () => process.env.JWT_SECRET ?? "dev-only";
const hashCode = (key: string, code: string) => createHmac("sha256", secret()).update(`otp:${key}:${code}`).digest("hex");
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Học sinh/người giám hộ ứng với thông tin nhập (SĐT, mã học sinh hoặc email). null nếu không có. */
export async function resolveGuardian(input: string): Promise<(Guardian & { validMobile: string | null }) | null> {
  const raw = input.trim();
  if (!raw || raw.length > 254) return null;
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.startsWith("84") && digits.length > 9 ? "0" + digits.slice(2) : digits;
  const students = await repo.findStudentsByLogin(raw, normalized, digits);
  const withPhone = students.find((s) => phoneKeyOf(s.guardianPhone));
  if (!withPhone) return students.length ? { phone: "", key: "", name: null, validMobile: null } : null;
  const phone = withPhone.guardianPhone!.replace(/\D/g, "");
  return { phone, key: phoneKeyOf(phone)!, name: withPhone.guardianName ?? `Phụ huynh em ${withPhone.fullName}`, validMobile: toVnMobile(phone) };
}

/** Mật khẩu mới của phụ huynh: ≥ 8 ký tự, không phải mật khẩu mặc định/quá dễ đoán/số điện thoại. */
export function validateNewParentPassword(password: string, phone: string): string | null {
  if (password.length < 8) return "Mật khẩu mới phải có ít nhất 8 ký tự.";
  if (password.length > 128) return "Mật khẩu quá dài.";
  if (/^(.)\1+$/.test(password)) return "Mật khẩu quá dễ đoán.";
  if (["12345678", "123456789", "1234567890", "password", "matkhau123", "11111111", "00000000"].includes(password.toLowerCase())) return "Mật khẩu quá dễ đoán.";
  const digits = phone.replace(/\D/g, "");
  if (digits && (password.replace(/\D/g, "") === digits || password === digits)) return "Không dùng số điện thoại làm mật khẩu.";
  return null;
}

/** Trạng thái chặn của một tài khoản phụ huynh: phải xác minh SMS trước, rồi mới đến đổi mật khẩu bắt buộc. */
export function parentGate(acc: { phoneVerifiedAt: Date | null; mustChangePwd: boolean }, smsEnabled = isSmsEnabled()): "verify" | "password" | null {
  if (smsEnabled && !acc.phoneVerifiedAt) return "verify";
  if (acc.mustChangePwd) return "password";
  return null;
}

/** Gửi mã xác minh tới số của người giám hộ. Không tiết lộ số/mã học sinh có tồn tại hay không. */
export async function requestParentOtp(identifier: string, ip: string): Promise<{ ok: true; sentTo?: string } | Fail> {
  if (!isSmsEnabled()) return { ok: false, error: "Nhà trường chưa bật xác minh qua SMS." };
  if (!(await rateLimit("otp-ip", ip, LIMITS.otpIp)).ok) return { ok: false, error: "Bạn yêu cầu mã quá nhiều lần. Vui lòng thử lại sau." };
  const g = await resolveGuardian(identifier);
  if (!g) return { ok: true }; // trả lời như đã gửi để không lộ số nào có trong hệ thống
  if (!g.validMobile) return { ok: false, error: "Hồ sơ học sinh chưa có số điện thoại người giám hộ hợp lệ. Vui lòng liên hệ giáo viên chủ nhiệm để bổ sung." };
  if (!(await rateLimit("otp-cooldown", g.key, LIMITS.otpCooldown)).ok) return { ok: false, error: "Vui lòng đợi 1 phút trước khi nhận lại mã." };
  if (!(await rateLimit("otp-phone", g.key, LIMITS.otpPhone)).ok) return { ok: false, error: "Số này đã nhận quá nhiều mã. Vui lòng thử lại sau 10 phút." };
  const code = String(randomInt(100000, 1_000_000));
  const row = await repo.createOtp(g.key, hashCode(g.key, code), new Date(Date.now() + OTP_TTL_MS));
  const sent = await sendSms("OTP", g.validMobile, `Ma xac minh So lien lac dien tu: ${code}. Co hieu luc 5 phut. Khong chia se ma nay cho bat ky ai.`);
  if (!sent.ok) { await repo.burnOtp(row.id); return { ok: false, error: "Không gửi được tin nhắn lúc này. Vui lòng thử lại sau hoặc liên hệ nhà trường." }; }
  return { ok: true, sentTo: maskPhone(g.validMobile) };
}

/** Kiểm tra mã. Tối đa 5 lần sai cho mỗi mã, mã dùng một lần, hết hạn sau 5 phút. */
export async function verifyParentOtp(identifier: string, code: string, ip: string): Promise<{ ok: true; guardian: Guardian } | Fail> {
  const bad: Fail = { ok: false, error: "Mã không đúng hoặc đã hết hạn. Vui lòng kiểm tra lại hoặc nhận mã mới." };
  if (!/^\d{6}$/.test(code.trim())) return bad;
  if (!(await rateLimit("otp-verify-ip", ip, LIMITS.otpVerifyIp)).ok) return { ok: false, error: "Bạn thử quá nhiều lần. Vui lòng thử lại sau." };
  const g = await resolveGuardian(identifier);
  if (!g || !g.key) return bad;
  if (!(await rateLimit("otp-verify-phone", g.key, LIMITS.otpVerifyPhone)).ok) return { ok: false, error: "Bạn thử quá nhiều lần. Vui lòng thử lại sau." };
  const otp = await repo.activeOtp(g.key);
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return bad;
  await repo.bumpOtpAttempts(otp.id);
  if (!safeEqual(otp.codeHash, hashCode(g.key, code.trim()))) return bad;
  if (!(await repo.consumeOtp(otp.id))) return bad;
  return { ok: true, guardian: { phone: g.phone, key: g.key, name: g.name } };
}

/**
 * Sau khi xác minh đúng: tạo tài khoản nếu chưa có hoặc đánh dấu đã xác minh.
 * forcePassword (đăng nhập lần đầu/quên mật khẩu bằng SMS) → bắt đặt mật khẩu mới ngay.
 */
export async function completeVerification(g: Guardian, forcePassword: boolean) {
  const existing = await repo.findAccountByPhoneKey(g.key);
  if (existing) return repo.markPhoneVerified(existing.id, forcePassword);
  // Tài khoản mới: mật khẩu tạm ngẫu nhiên không ai biết, người dùng phải tự đặt ngay (mustChangePwd).
  return repo.createAccount({ phone: g.phone, fullName: g.name, passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), phoneVerifiedAt: new Date(), mustChangePwd: true });
}

export async function setInitialParentPassword(accountId: string, newPassword: string): Promise<{ ok: true } | Fail> {
  const acc = await repo.findAccountById(accountId);
  if (!acc) return { ok: false, error: "Không tìm thấy tài khoản." };
  const problem = validateNewParentPassword(newPassword, acc.phone);
  if (problem) return { ok: false, error: problem };
  await repo.setPassword(acc.id, await bcrypt.hash(newPassword, 10));
  return { ok: true };
}
