import { logger } from "@/lib/logger";
import { reportError } from "@/lib/observability/report-error";
import { getRequestContext } from "@/lib/observability/request-context";
export type Res = { ok?: string; error?: string; data?: Record<string, string> } | null;

/** Bọc server action: bắt lỗi → trả {error}, giữ nguyên redirect của Next. */
export function wrap(fn: (fd: FormData) => Promise<string | { ok: string; data?: Record<string, string> } | void>) {
  return async (_: Res, fd: FormData): Promise<Res> => {
    try {
      const r = await fn(fd);
      if (typeof r === "string") return { ok: r };
      if (r) return r;
      return { ok: "Đã lưu" };
    } catch (e) {
      const err = e as { digest?: string; message?: string; name?: string; constructor?: { name?: string } };
      if (err.digest?.startsWith("NEXT_REDIRECT")) throw e;
      // Lỗi hạ tầng (Prisma/DB...) không phải thông báo nghiệp vụ: ghi lại đầy đủ, chỉ trả mã tham chiếu cho người dùng.
      if (/^PrismaClient/.test(err.constructor?.name ?? err.name ?? "")) {
        void reportError(e, { source: "action" });
        const ref = getRequestContext()?.requestId?.slice(0, 8);
        return { error: `Lỗi hệ thống, vui lòng thử lại.${ref ? ` Mã tham chiếu: ${ref}` : ""}` };
      }
      logger.warn({ err: e }, "action_rejected");
      return { error: err.message ?? "Có lỗi xảy ra" };
    }
  };
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const int = (fd: FormData, k: string, d = 0) => {
  const v = parseInt(str(fd, k).replace(/\D/g, ""), 10);
  return Number.isFinite(v) ? v : d;
};
export const opt = (fd: FormData, k: string) => str(fd, k) || null;
