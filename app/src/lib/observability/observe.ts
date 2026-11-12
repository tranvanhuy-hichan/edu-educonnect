import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { reportError } from "./report-error";
import { runWithContext } from "./request-context";

/**
 * Bọc route handler: gắn requestId (do proxy.ts cấp), log một dòng truy cập (method, path, status, thời gian),
 * và biến lỗi không lường trước thành 500 kèm requestId để người dùng báo lại, quản trị truy được trong /van-hanh.
 */
export function observe<A extends [Request, ...unknown[]]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const request = args[0];
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(request.url);
    const started = performance.now();
    return runWithContext({ requestId, method: request.method, path: url.pathname }, async () => {
      let response: Response;
      try {
        response = await handler(...args);
      } catch (error) {
        await reportError(error, { source: "route", route: url.pathname, method: request.method, requestId });
        response = NextResponse.json({ error: "Lỗi hệ thống", requestId }, { status: 500 });
      }
      const ms = Math.round(performance.now() - started);
      const level = response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info";
      logger[level]({ requestId, method: request.method, path: url.pathname, status: response.status, ms }, "http_request");
      try { response.headers.set("x-request-id", requestId); } catch { /* phản hồi redirect bất biến */ }
      return response;
    });
  };
}
