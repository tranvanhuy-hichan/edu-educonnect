"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  PARENT_COOKIE_NAME,
  getParentSession,
  requireParentSession,
  signParentToken,
} from "@/lib/auth/parent-session";

function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("84") && cleaned.length > 9) {
    cleaned = "0" + cleaned.slice(2);
  }
  return cleaned;
}

export async function parentLogin(formData: FormData) {
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!rawPhone) {
    return { success: false, error: "Vui lòng nhập số điện thoại người giám hộ." };
  }
  if (!password) {
    return { success: false, error: "Vui lòng nhập mật khẩu (mặc định: 123456)." };
  }

  const phone = normalizePhone(rawPhone);
  if (phone.length < 9 || phone.length > 11) {
    return { success: false, error: "Số điện thoại không hợp lệ (cần từ 9 đến 11 chữ số)." };
  }

  // 1. Kiểm tra số điện thoại có trong hồ sơ của học sinh nào không
  const students = await prisma.student.findMany({
    where: {
      OR: [
        { guardianPhone: phone },
        { guardianPhone: rawPhone },
        { guardianPhone: { startsWith: phone } },
      ],
    },
    select: { id: true, fullName: true, guardianName: true, guardianPhone: true },
  });

  if (!students.length) {
    return {
      success: false,
      error:
        "Số điện thoại này chưa được đăng ký trong hồ sơ học sinh của nhà trường. Vui lòng liên hệ GVCN để bổ sung số điện thoại phụ huynh.",
    };
  }

  // Lấy tên phụ huynh từ hồ sơ học sinh nếu có
  const guardianName =
    students.find((s) => s.guardianName)?.guardianName ??
    `Phụ huynh em ${students[0].fullName}`;

  // 2. Tìm hoặc khởi tạo tài khoản phụ huynh
  let account = await prisma.parentAccount.findUnique({
    where: { phone },
  });

  if (!account) {
    // Tài khoản chưa từng đăng nhập -> yêu cầu mật khẩu mặc định 123456
    if (password !== "123456") {
      return {
        success: false,
        error:
          "Tài khoản phụ huynh đăng nhập lần đầu. Vui lòng nhập mật khẩu mặc định là: 123456",
      };
    }

    const passwordHash = await bcrypt.hash("123456", 10);
    account = await prisma.parentAccount.create({
      data: {
        phone,
        fullName: guardianName,
        passwordHash,
      },
    });
  } else {
    // Đã có tài khoản -> đối chiếu mật khẩu
    const isMatch = await bcrypt.compare(password, account.passwordHash);
    if (!isMatch) {
      return {
        success: false,
        error:
          "Mật khẩu không chính xác. Mật khẩu khởi tạo mặc định là 123456. Nếu quên mật khẩu, vui lòng liên hệ GVCN để được cấp lại.",
      };
    }
  }

  // 3. Cấp session cookie riêng biệt cho phụ huynh
  const token = signParentToken({
    parentId: account.id,
    phone: account.phone,
    fullName: account.fullName,
  });

  const cookieStore = await cookies();
  cookieStore.set(PARENT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 ngày
  });

  return { success: true };
}

export async function parentChangePassword(formData: FormData) {
  const parent = await requireParentSession();

  const oldPassword = String(formData.get("oldPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!oldPassword || !newPassword || !confirmPassword) {
    return { success: false, error: "Vui lòng điền đầy đủ các thông tin mật khẩu." };
  }

  if (newPassword.length < 6) {
    return { success: false, error: "Mật khẩu mới phải có ít nhất 6 ký tự." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Mật khẩu mới và xác nhận mật khẩu không khớp." };
  }

  const account = await prisma.parentAccount.findUnique({
    where: { id: parent.id },
  });

  if (!account) {
    return { success: false, error: "Không tìm thấy thông tin tài khoản." };
  }

  const isMatch = await bcrypt.compare(oldPassword, account.passwordHash);
  if (!isMatch) {
    return { success: false, error: "Mật khẩu hiện tại không đúng." };
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.parentAccount.update({
    where: { id: parent.id },
    data: { passwordHash: newHash },
  });

  return { success: true, message: "Đổi mật khẩu thành công!" };
}

export async function parentLogout() {
  const cookieStore = await cookies();
  cookieStore.delete(PARENT_COOKIE_NAME);
  redirect("/phu-huynh/dang-nhap");
}
