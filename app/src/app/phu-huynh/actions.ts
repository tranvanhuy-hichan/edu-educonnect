"use server";
import { consumeLoginAttempt } from "@/modules/auth/login-throttle.repository";
import { credentialTag } from "@/lib/auth/credential-tag";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import {
  PARENT_COOKIE_NAME,
  requireParentIdentity,
  requireParentSession,
  signParentToken,
} from "@/lib/auth/parent-session";
import { isSmsEnabled } from "@/modules/sms/provider";
import * as accounts from "@/modules/parent/parent-account.repository";
import {
  DEFAULT_PARENT_PASSWORD,
  completeVerification,
  parentGate,
  requestParentOtp,
  resolveGuardian,
  setInitialParentPassword,
  validateNewParentPassword,
  verifyParentOtp,
} from "@/modules/parent/parent-auth.service";

type Account = { id: string; phone: string; fullName: string | null; passwordHash: string };

/** Cấp cookie phiên riêng cho phụ huynh (30 ngày). Gọi lại sau khi đổi mật khẩu vì mã thông hành gắn với mật khẩu hiện tại. */
async function issueSession(account: Account) {
  const token = signParentToken({ credentialTag: credentialTag(account.passwordHash), parentId: account.id, phone: account.phone, fullName: account.fullName });
  (await cookies()).set(PARENT_COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
}

const clientIpOf = async () => { const h = await headers(); return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"; };

export async function parentLogin(formData: FormData) {
  const input = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const smsOn = isSmsEnabled();

  if (!input) return { success: false, error: "Vui lòng nhập Số điện thoại người giám hộ hoặc Mã học sinh." };
  if (!password) return { success: false, error: smsOn ? "Vui lòng nhập mật khẩu. Lần đầu đăng nhập hoặc quên mật khẩu: chọn “Nhận mã xác minh qua SMS”." : "Vui lòng nhập mật khẩu (mặc định khởi tạo: 123456)." };

  const invalid = { success: false, error: "Thông tin đăng nhập không hợp lệ hoặc chưa thể đăng nhập. Vui lòng thử lại sau hoặc liên hệ nhà trường." };
  if (input.length > 254 || password.length > 1024) return invalid;
  if (!await consumeLoginAttempt("parent", input)) return invalid;

  const guardian = await resolveGuardian(input);
  if (!guardian) return invalid;
  if (!guardian.key) return { success: false, error: "Học sinh này chưa có Số điện thoại người giám hộ trong hồ sơ. Vui lòng liên hệ GVCN để bổ sung." };
  if (!await consumeLoginAttempt("parent-phone", guardian.phone)) return invalid;

  let account = await accounts.findAccountByPhoneKey(guardian.key);
  if (!account) {
    // Có SMS: không cho tạo tài khoản bằng mật khẩu mặc định, phải xác minh số điện thoại bằng mã SMS.
    if (smsOn) return { success: false, error: "Đây là lần đầu đăng nhập số điện thoại này. Vui lòng chọn “Nhận mã xác minh qua SMS” để kích hoạt tài khoản." };
    if (password !== DEFAULT_PARENT_PASSWORD) return invalid;
    account = await accounts.createAccount({ phone: guardian.phone, fullName: guardian.name, passwordHash: await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 10) });
  } else if (!await bcrypt.compare(password, account.passwordHash)) return invalid;

  // Còn dùng mật khẩu mặc định thì bắt đổi ngay (chỉ khi nhà trường đã bật SMS để không thay đổi hành vi cũ).
  if (smsOn && password === DEFAULT_PARENT_PASSWORD && !account.mustChangePwd) account = await accounts.requirePasswordChange(account.id);
  await issueSession(account);
  return { success: true };
}

// ───────────── Xác minh bằng SMS ─────────────

/** Lần đầu đăng nhập / quên mật khẩu: nhận mã SMS theo số điện thoại (hoặc mã học sinh). */
export async function parentRequestOtp(formData: FormData) {
  return requestParentOtp(String(formData.get("phone") ?? ""), await clientIpOf());
}

/** Nhập mã từ trang đăng nhập: đúng → có phiên và bị buộc đặt mật khẩu mới. */
export async function parentVerifyOtp(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const r = await verifyParentOtp(String(formData.get("phone") ?? ""), String(formData.get("code") ?? ""), await clientIpOf());
  if (!r.ok) return { success: false, error: r.error };
  await issueSession(await completeVerification(r.guardian, true));
  return { success: true };
}

/** Đã đăng nhập bằng mật khẩu nhưng chưa xác minh số: gửi mã tới chính số của tài khoản. */
export async function parentSendSessionOtp() {
  const parent = await requireParentIdentity();
  return requestParentOtp(parent.phone, await clientIpOf());
}

export async function parentVerifySessionOtp(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const parent = await requireParentIdentity();
  const r = await verifyParentOtp(parent.phone, String(formData.get("code") ?? ""), await clientIpOf());
  if (!r.ok) return { success: false, error: r.error };
  await completeVerification(r.guardian, false);
  return { success: true };
}

/** Đặt mật khẩu mới bắt buộc (không cần mật khẩu cũ vì vừa xác minh/đăng nhập). Phải xác minh SMS xong mới được đặt. */
export async function parentSetInitialPassword(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const parent = await requireParentIdentity();
  const gate = parentGate(parent);
  if (gate === "verify") return { success: false, error: "Vui lòng xác minh số điện thoại trước." };
  if (gate !== "password") return { success: true };
  const next = String(formData.get("newPassword") ?? "");
  if (next !== String(formData.get("confirmPassword") ?? "")) return { success: false, error: "Mật khẩu mới và xác nhận mật khẩu không khớp." };
  const r = await setInitialParentPassword(parent.id, next);
  if (!r.ok) return { success: false, error: r.error };
  const fresh = await accounts.findAccountById(parent.id);
  if (fresh) await issueSession(fresh); // mật khẩu đổi nên mã thông hành cũ hết hiệu lực
  return { success: true };
}

export async function parentChangePassword(formData: FormData) {
  const parent = await requireParentSession();

  const oldPassword = String(formData.get("oldPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!oldPassword || !newPassword || !confirmPassword) return { success: false, error: "Vui lòng điền đầy đủ các thông tin mật khẩu." };
  if (isSmsEnabled()) {
    const problem = validateNewParentPassword(newPassword, parent.phone);
    if (problem) return { success: false, error: problem };
  } else if (newPassword.length < 6) return { success: false, error: "Mật khẩu mới phải có ít nhất 6 ký tự." };
  if (newPassword !== confirmPassword) return { success: false, error: "Mật khẩu mới và xác nhận mật khẩu không khớp." };

  const account = await accounts.findAccountById(parent.id);
  if (!account) return { success: false, error: "Không tìm thấy thông tin tài khoản." };
  if (!await bcrypt.compare(oldPassword, account.passwordHash)) return { success: false, error: "Mật khẩu hiện tại không đúng." };

  await accounts.setPassword(parent.id, await bcrypt.hash(newPassword, 10));
  const fresh = await accounts.findAccountById(parent.id);
  if (fresh) await issueSession(fresh);
  return { success: true, message: "Đổi mật khẩu thành công!" };
}

export async function parentLogout() {
  (await cookies()).delete(PARENT_COOKIE_NAME);
  redirect("/phu-huynh/dang-nhap");
}
