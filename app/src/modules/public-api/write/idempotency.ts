import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,100}$/;
export const requestHash = (method: string, path: string, body: string) => createHash("sha256").update(`${method} ${path}\n${body}`).digest("hex");

export type Begin =
  | { state: "new"; id: string }
  | { state: "replay"; status: number; response: unknown }
  | { state: "mismatch" }
  | { state: "in_progress" };

/**
 * Giữ chỗ cho một Idempotency-Key. Bản ghi tạo trước khi xử lý nên hai yêu cầu song song cùng khoá không thể cùng chạy:
 * yêu cầu thứ hai nhận "đang xử lý". Gửi lại sau khi xong thì nhận đúng kết quả lần đầu.
 */
export async function beginIdempotent(keyId: string, idemKey: string, hash: string): Promise<Begin> {
  try {
    const row = await prisma.apiIdempotency.create({ data: { keyId, idemKey, requestHash: hash } });
    return { state: "new", id: row.id };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const row = await prisma.apiIdempotency.findUnique({ where: { keyId_idemKey: { keyId, idemKey } } });
    if (!row) return { state: "in_progress" };
    if (row.requestHash !== hash) return { state: "mismatch" };
    if (row.status === 0) return { state: "in_progress" };
    return { state: "replay", status: row.status, response: row.response };
  }
}
export const finishIdempotent = (id: string, status: number, response: unknown) => prisma.apiIdempotency.update({ where: { id }, data: { status, response: JSON.parse(JSON.stringify(response)) } });
/** Xử lý lỗi thì nhả khoá để người gọi sửa nội dung rồi gửi lại với cùng khoá. */
export const abortIdempotent = (id: string) => prisma.apiIdempotency.deleteMany({ where: { id } });
