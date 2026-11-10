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
  const input = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!input) {
    return { success: false, error: "Vui lòng nhập Số điện thoại người giám hộ hoặc Mã học sinh." };
  }
  if (!password) {
    return { success: false, error: "Vui lòng nhập mật khẩu (mặc định khởi tạo: 123456)." };
  }

  const cleanedDigits = input.replace(/\D/g, "");
  const normalized = normalizePhone(input);

  // 1. Tìm hồ sơ học sinh theo SĐT người giám hộ, Mã học sinh (HS...) hoặc Email
  const students = await prisma.student.findMany({
    where: {
      OR: [
        // Khớp theo mã học sinh
        { code: { equals: input, mode: "insensitive" } },
        // Khớp theo email
        { user: { email: { equals: input, mode: "insensitive" } } },
        // Khớp theo SĐT
        { guardianPhone: input },
        { guardianPhone: normalized },
        ...(cleanedDigits.length >= 7
          ? [{ guardianPhone: { contains: cleanedDigits.slice(-9) } }]
          : []),
      ],
    },
    select: { id: true, code: true, fullName: true, guardianName: true, guardianPhone: true },
  });

  if (!students.length) {
    return {
      success: false,
      error: `Không tìm thấy hồ sơ học sinh khớp với "${input}". Quý phụ huynh vui lòng kiểm tra lại Số điện thoại đã đăng ký hoặc Mã học sinh (VD: 0911111111 hoặc HS00000004).`,
    };
  }

  // Số điện thoại dùng làm định danh tài khoản phụ huynh
  const matchedStudent = students[0];
  const phone = matchedStudent.guardianPhone?.replace(/\D/g, "") || normalized || input;

  if (!phone) {
    return {
      success: false,
      error: "Học sinh này chưa có Số điện thoại người giám hộ trong hồ sơ. Vui lòng liên hệ GVCN để bổ sung.",
    };
  }

  const guardianName =
    matchedStudent.guardianName ?? `Phụ huynh em ${matchedStudent.fullName}`;

  // 2. Tìm hoặc khởi tạo tài khoản phụ huynh
  let account = await prisma.parentAccount.findFirst({
    where: {
      OR: [
        { phone },
        { phone: normalized },
        { phone: input },
      ],
    },
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
          "Mật khẩu không chính xác. Mật khẩu mặc định là 123456. Nếu quên mật khẩu, vui lòng liên hệ GVCN để được đặt lại.",
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
