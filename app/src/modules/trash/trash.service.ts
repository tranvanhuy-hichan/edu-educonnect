import { Prisma } from "@prisma/client";
import { isSystemAdmin, type SessionUser } from "@/lib/auth/session";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import * as repo from "./trash.repository";

export const KIND_LABEL: Record<string, string> = { STUDENT: "Học sinh", CLASS: "Lớp học", LESSON_POST: "Bài học của lớp", QUESTION: "Câu hỏi", LIBRARY_LESSON: "Bài học trong kho" };

function assertAdmin(user: SessionUser) {
  if (!isSystemAdmin(user)) throw new ForbiddenError("Chỉ Quản trị hệ thống được dùng thùng rác");
}

export async function listTrash(user: SessionUser, kind?: string) {
  assertAdmin(user);
  return repo.listTrash(kind && KIND_LABEL[kind] ? kind : undefined);
}

/** Khôi phục; lỗi dữ liệu (trùng mã, thiếu bản ghi cha) được dịch ra thông báo dễ hiểu và không thay đổi gì. */
export async function restoreItem(user: SessionUser, id: string) {
  assertAdmin(user);
  try {
    const r = await repo.restoreTrash(id);
    if (!r.ok) throw new ConflictError(r.error);
    return r;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ConflictError("Không khôi phục được vì mã hoặc email của mục này đã được dùng cho bản ghi khác. Hãy đổi bản ghi đang trùng rồi thử lại.");
      if (error.code === "P2003") throw new ConflictError("Không khôi phục được vì dữ liệu liên quan (lớp, môn, năm học, phân công…) đã bị xoá. Hãy khôi phục mục liên quan trước.");
    }
    throw error;
  }
}

export async function purgeItem(user: SessionUser, id: string) {
  assertAdmin(user);
  const r = await repo.purgeTrash(id);
  if (!r.count) throw new ConflictError("Mục này không còn trong thùng rác");
}
