import { prisma } from "@/lib/prisma";

const last9 = (digits: string) => digits.slice(-9);

/** Tìm học sinh theo số điện thoại người giám hộ, mã học sinh hoặc email học sinh (cùng cách ghép như đăng nhập phụ huynh). */
export function findStudentsByLogin(input: string, normalized: string, cleanedDigits: string) {
  return prisma.student.findMany({
    where: {
      OR: [
        { code: { equals: input, mode: "insensitive" } },
        { user: { email: { equals: input, mode: "insensitive" } } },
        { guardianPhone: input }, { guardianPhone: normalized },
        ...(cleanedDigits.length >= 7 ? [{ guardianPhone: { contains: last9(cleanedDigits) } }] : []),
      ],
    },
    select: { id: true, code: true, fullName: true, guardianName: true, guardianPhone: true },
  });
}

export const findAccountByPhoneKey = (phoneKey: string) => prisma.parentAccount.findFirst({ where: { phone: { endsWith: phoneKey } } });
export const findAccountById = (id: string) => prisma.parentAccount.findUnique({ where: { id } });
export const createAccount = (data: { phone: string; fullName: string | null; passwordHash: string; phoneVerifiedAt?: Date | null; mustChangePwd?: boolean }) => prisma.parentAccount.create({ data });
export const markPhoneVerified = (id: string, forcePassword: boolean) => prisma.parentAccount.update({ where: { id }, data: { phoneVerifiedAt: new Date(), ...(forcePassword ? { mustChangePwd: true } : {}) } });
export const requirePasswordChange = (id: string) => prisma.parentAccount.update({ where: { id }, data: { mustChangePwd: true } });
export const setPassword = (id: string, passwordHash: string) => prisma.parentAccount.update({ where: { id }, data: { passwordHash, mustChangePwd: false } });

// ── OTP ──
export async function createOtp(phoneKey: string, codeHash: string, expiresAt: Date) {
  // Mỗi số chỉ một mã còn hiệu lực: mã mới vô hiệu hoá mã cũ.
  await prisma.parentOtp.updateMany({ where: { phoneKey, consumedAt: null }, data: { consumedAt: new Date() } });
  return prisma.parentOtp.create({ data: { phoneKey, codeHash, expiresAt } });
}
export const activeOtp = (phoneKey: string) => prisma.parentOtp.findFirst({ where: { phoneKey, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
export const bumpOtpAttempts = (id: string) => prisma.parentOtp.update({ where: { id }, data: { attempts: { increment: 1 } } });
/** Dùng mã đúng một lần: chỉ thành công nếu CHƯA bị dùng (chống hai yêu cầu song song cùng dùng một mã). */
export const consumeOtp = async (id: string) => (await prisma.parentOtp.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } })).count === 1;
export const burnOtp = (id: string) => prisma.parentOtp.update({ where: { id }, data: { consumedAt: new Date() } });
