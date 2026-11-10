import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const PARENT_COOKIE_NAME = "educonnect_parent_token";

export type ParentSessionPayload = {
  parentId: string;
  phone: string;
  fullName: string | null;
};

export type ParentMe = {
  id: string;
  phone: string;
  fullName: string | null;
  createdAt: Date;
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET chưa được cấu hình trong biến môi trường");
  }
  return secret;
}

export function signParentToken(payload: ParentSessionPayload): string {
  // Thời hạn 30 ngày cho phụ huynh thuận tiện theo dõi con trên điện thoại
  return jwt.sign(payload, getSecret(), { expiresIn: "30d" });
}

export function verifyParentToken(token: string): ParentSessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as ParentSessionPayload;
  } catch {
    return null;
  }
}

/** Đọc session phụ huynh từ cookie httpOnly và kiểm tra trong DB. */
export async function getParentSession(): Promise<ParentMe | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifyParentToken(token);
  if (!payload || !payload.parentId) return null;

  try {
    const parent = await prisma.parentAccount.findUnique({
      where: { id: payload.parentId },
      select: { id: true, phone: true, fullName: true, createdAt: true },
    });
    return parent;
  } catch {
    return null;
  }
}

/** Dùng trong page / server action: yêu cầu phụ huynh đã đăng nhập. */
export async function requireParentSession(): Promise<ParentMe> {
  const parent = await getParentSession();
  if (!parent) {
    redirect("/phu-huynh/dang-nhap");
  }
  return parent;
}
