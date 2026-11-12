import { matchesCredential } from "./credential-tag";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parentGate } from "@/modules/parent/parent-auth.service";

export const PARENT_COOKIE_NAME = "educonnect_parent_token";

export type ParentSessionPayload = {
  credentialTag: string;
  parentId: string;
  phone: string;
  fullName: string | null;
};

export type ParentMe = {
  id: string;
  phone: string;
  fullName: string | null;
  createdAt: Date;
  phoneVerifiedAt: Date | null;
  mustChangePwd: boolean;
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
    const parent = await prisma.parentAccount.findUnique({ where: { id: payload.parentId } });
    if (!parent || !matchesCredential(payload.credentialTag, parent.passwordHash)) return null;
    return { id: parent.id, phone: parent.phone, fullName: parent.fullName, createdAt: parent.createdAt, phoneVerifiedAt: parent.phoneVerifiedAt, mustChangePwd: parent.mustChangePwd };
  } catch { return null; }
}

/** Chỉ cần đã đăng nhập (kể cả khi còn phải xác minh SMS / đổi mật khẩu). Dành riêng cho chính các trang xác minh và đặt mật khẩu. */
export async function requireParentIdentity(): Promise<ParentMe> {
  const parent = await getParentSession();
  if (!parent) redirect("/phu-huynh/dang-nhap");
  return parent;
}

/**
 * Dùng trong page / server action xem dữ liệu: phụ huynh phải đăng nhập, đã xác minh SMS (khi nhà trường bật SMS)
 * và đã đổi mật khẩu bắt buộc. Chặn ở máy chủ nên không thể lách bằng cách gõ thẳng địa chỉ.
 */
export async function requireParentSession(): Promise<ParentMe> {
  const parent = await requireParentIdentity();
  const gate = parentGate(parent);
  if (gate === "verify") redirect("/phu-huynh/xac-minh");
  if (gate === "password") redirect("/phu-huynh/doi-mat-khau");
  return parent;
}
