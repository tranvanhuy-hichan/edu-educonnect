import { NextResponse, after } from "next/server";
import { ZodError, type ZodType } from "zod";
import { reportError } from "@/lib/observability/report-error";
import { logger } from "@/lib/logger";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { authenticate, recordCall, type AuthSuccess } from "@/modules/apikeys/api-key.service";
import { SCOPES, type Scope } from "@/modules/apikeys/api-key.scopes";
import { ApiError } from "@/modules/public-api/public-api.service";
import { IDEMPOTENCY_KEY, abortIdempotent, beginIdempotent, finishIdempotent, requestHash } from "@/modules/public-api/write/idempotency";

export const MAX_BODY_BYTES = 64 * 1024;
export type ApiContext = {
  request: Request; url: URL; auth: AuthSuccess; params: Record<string, string>;
  /** Đọc và kiểm tra thân JSON theo schema (từ chối trường lạ, trả 400 kèm chi tiết). */
  json: <T>(schema: ZodType<T>) => T;
};
type Body = { data: unknown; meta?: unknown; status?: number };
type Options = { /** POST tạo mới: bắt buộc header Idempotency-Key để gửi lại không tạo trùng. */ idempotent?: boolean };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8", ...headers } });
const errorBody = (code: string, message: string, extra: Record<string, unknown> = {}) => ({ error: { code, message, ...extra } });

async function readBody(request: Request): Promise<string> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new ApiError(415, "unsupported_media_type", "Gửi thân yêu cầu dạng JSON với header Content-Type: application/json.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large", `Thân yêu cầu tối đa ${MAX_BODY_BYTES / 1024} KB.`);
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large", `Thân yêu cầu tối đa ${MAX_BODY_BYTES / 1024} KB.`);
  return text;
}

/**
 * Bọc endpoint của API ngoài: xác thực khoá → kiểm tra quyền → giới hạn tốc độ → (ghi) kiểm tra thân JSON + chống gửi trùng → chạy → ghi nhật ký.
 * Mọi lỗi trả về cùng một dạng { error: { code, message } } kèm mã trạng thái HTTP chuẩn.
 */
export function publicApi(required: Scope[], handler: (ctx: ApiContext) => Promise<Body>, opts: Options = {}) {
  return async (request: Request, routeCtx?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const started = performance.now();
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(request.url);
    const base = { "X-Request-Id": requestId };
    const isWrite = request.method !== "GET";

    const auth = await authenticate(request);
    if (!auth.ok) {
      if (auth.keyId && auth.ip) {
        const { keyId, ip, status } = auth;
        const log = () => recordCall(keyId, ip, { method: request.method, path: url.pathname, status, ms: Math.round(performance.now() - started) });
        try { after(log); } catch { await log(); }
      }
      return json(auth.status, errorBody(auth.code, auth.message), { ...base, ...(auth.retryAfterSec ? { "Retry-After": String(auth.retryAfterSec) } : {}) });
    }

    const rate = { "X-RateLimit-Limit": String(auth.key.rateLimitPerMin), "X-RateLimit-Remaining": String(auth.limit.remaining), "X-RateLimit-Reset": String(auth.limit.retryAfterSec) };
    let status = 200;
    let response: Response;
    let idemId: string | null = null;
    try {
      const missing = required.filter((s) => !auth.scopes.has(s));
      if (missing.length) throw new ApiError(403, "insufficient_scope", `Khoá API chưa được cấp quyền: ${missing.map((s) => `${s} (${SCOPES[s].label})`).join(", ")}.`, { required: missing });

      let raw = "";
      if (isWrite) {
        // Ghi dữ liệu: giới hạn riêng chặt hơn đọc (một khoá không thể dội hàng nghìn thay đổi)
        const w = await rateLimit("api-write", auth.key.id, LIMITS.apiWrite);
        if (!w.ok) return json(429, errorBody("write_rate_limited", "Vượt giới hạn số yêu cầu GHI mỗi phút."), { ...base, ...rate, "Retry-After": String(w.retryAfterSec) });
        raw = await readBody(request);
        if (opts.idempotent) {
          const idemKey = request.headers.get("idempotency-key") ?? "";
          if (!IDEMPOTENCY_KEY.test(idemKey)) throw new ApiError(400, "idempotency_key_required", "Yêu cầu tạo mới cần header Idempotency-Key (8–100 ký tự chữ, số, _ . : -) để gửi lại không tạo trùng.");
          const begun = await beginIdempotent(auth.key.id, idemKey, requestHash(request.method, url.pathname, raw));
          if (begun.state === "replay") { status = begun.status; return json(begun.status, begun.response, { ...base, ...rate, "Idempotent-Replay": "true" }); }
          if (begun.state === "mismatch") throw new ApiError(422, "idempotency_key_reuse", "Idempotency-Key này đã dùng cho một yêu cầu có nội dung khác. Hãy dùng khoá mới.");
          if (begun.state === "in_progress") throw new ApiError(409, "request_in_progress", "Yêu cầu với Idempotency-Key này đang được xử lý. Hãy thử lại sau giây lát.");
          idemId = begun.id;
        }
      }
      const params = (await routeCtx?.params) ?? {};
      const parse = <T,>(schema: ZodType<T>): T => {
        let value: unknown;
        try { value = JSON.parse(raw); } catch { throw new ApiError(400, "invalid_json", "Thân yêu cầu không phải JSON hợp lệ."); }
        return schema.parse(value);
      };
      const result = await handler({ request, url, auth, params, json: parse });
      status = result.status ?? 200;
      const body = { data: result.data, ...(result.meta ? { meta: result.meta } : {}) };
      if (idemId) { await finishIdempotent(idemId, status, body); idemId = null; }
      response = json(status, body, { ...base, ...rate });
    } catch (error) {
      if (idemId) await abortIdempotent(idemId).catch(() => undefined);
      if (error instanceof ZodError) {
        status = 400;
        response = json(400, errorBody("invalid_parameters", "Tham số hoặc dữ liệu không hợp lệ.", { details: error.issues.map((i) => ({ parameter: i.path.join(".") || "(body)", message: i.message })) }), { ...base, ...rate });
      } else if (error instanceof ApiError) {
        status = error.status;
        response = json(error.status, errorBody(error.code, error.message, error.extra), { ...base, ...rate });
      } else {
        status = 500;
        await reportError(error, { source: "route", route: url.pathname, method: request.method, requestId });
        response = json(500, errorBody("internal_error", "Lỗi hệ thống. Vui lòng thử lại sau.", { requestId }), { ...base, ...rate });
      }
    }
    const ms = Math.round(performance.now() - started);
    logger.info({ requestId, keyId: auth.key.id, method: request.method, path: url.pathname, status, ms }, "api_v1_request");
    const log = () => recordCall(auth.key.id, auth.ip, { method: request.method, path: url.pathname, status, ms });
    try { after(log); } catch { await log(); } // ngoài ngữ cảnh request (test) thì ghi ngay
    return response;
  };
}
