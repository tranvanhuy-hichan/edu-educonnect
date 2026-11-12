import { logger } from "@/lib/logger";

export type SmsResult = { ok: boolean; code: string; ref?: string; error?: string };
export type SmsProvider = { name: string; send(to: string, content: string): Promise<SmsResult> };

const TIMEOUT_MS = 12_000;

/** Mã lỗi eSMS (CodeResult) → thông báo tiếng Việt cho quản trị. 100 = thành công. */
const ESMS_ERRORS: Record<string, string> = {
  "99": "Lỗi không xác định từ eSMS",
  "101": "Sai ApiKey/SecretKey (đăng nhập eSMS thất bại)",
  "102": "Tài khoản eSMS bị khoá",
  "103": "Tài khoản eSMS không đủ tiền",
  "104": "Sai Brandname hoặc Brandname chưa được duyệt",
  "118": "Loại tin nhắn (SmsType) không hợp lệ",
  "119": "Brandname chưa đăng ký loại tin này",
  "131": "Nội dung quá dài",
  "132": "Không có quyền gửi loại tin này",
};

/**
 * eSMS.vn — REST API v4 (SendMultipleMessage_V4_post_json). Cấu hình qua biến môi trường:
 *   ESMS_API_KEY, ESMS_SECRET_KEY (bắt buộc), ESMS_SMS_TYPE (mặc định "8": đầu số cố định), ESMS_BRANDNAME (khi dùng loại tin Brandname),
 *   SMS_SANDBOX=1 (eSMS nhận yêu cầu nhưng KHÔNG gửi thật, để thử tích hợp).
 * Nội dung luôn không dấu nên IsUnicode = 0.
 */
export function esmsProvider(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): SmsProvider {
  const endpoint = env.ESMS_ENDPOINT || "https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/";
  return {
    name: "esms",
    async send(to, content) {
      const body: Record<string, string> = {
        ApiKey: env.ESMS_API_KEY ?? "", SecretKey: env.ESMS_SECRET_KEY ?? "", Phone: to, Content: content,
        SmsType: env.ESMS_SMS_TYPE || "8", IsUnicode: "0", Sandbox: env.SMS_SANDBOX === "1" ? "1" : "0",
      };
      if (env.ESMS_BRANDNAME) body.Brandname = env.ESMS_BRANDNAME;
      try {
        const res = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return { ok: false, code: `HTTP${res.status}`, error: `eSMS trả HTTP ${res.status}` };
        const data = (await res.json()) as { CodeResult?: string | number; ErrorMessage?: string; SMSID?: string };
        const code = String(data.CodeResult ?? "");
        if (code === "100") return { ok: true, code, ref: data.SMSID };
        return { ok: false, code, error: ESMS_ERRORS[code] ?? data.ErrorMessage ?? `eSMS từ chối (mã ${code || "?"})` };
      } catch (error) {
        const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        logger.warn({ err: error }, "sms_provider_unreachable");
        return { ok: false, code: timeout ? "TIMEOUT" : "NETWORK", error: timeout ? "eSMS không phản hồi kịp" : "Không kết nối được eSMS" };
      }
    },
  };
}

/** Nhà cung cấp "log" chỉ để chạy thử ở máy dev: ghi nội dung ra log thay vì gửi. Bị chặn ở production. */
const logProvider: SmsProvider = { name: "log", async send(to, content) { logger.info({ to: `${to.slice(0, 3)}****${to.slice(-3)}`, content }, "sms_dev_log"); return { ok: true, code: "LOG", ref: "dev" }; } };

let override: SmsProvider | null = null;
/** Dành cho test: thay nhà cung cấp. */
export const setSmsProvider = (p: SmsProvider | null) => { override = p; };

/** Chọn nhà cung cấp theo cấu hình; null = SMS chưa được kích hoạt. */
export function currentProvider(env: NodeJS.ProcessEnv = process.env): SmsProvider | null {
  if (override) return override;
  if (env.SMS_PROVIDER === "log" && env.NODE_ENV !== "production") return logProvider;
  if (env.ESMS_API_KEY && env.ESMS_SECRET_KEY) return esmsProvider(env);
  return null;
}

/** SMS chỉ bật khi có khoá nhà cung cấp. Không có khoá → mọi tính năng SMS tắt và hệ thống chạy như trước. */
export const isSmsEnabled = (env: NodeJS.ProcessEnv = process.env) => currentProvider(env) !== null;
