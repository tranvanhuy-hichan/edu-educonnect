/**
 * Cho đoàn viên/học sinh của Cổng thông tin Đoàn (khkt) dùng EduConnect bằng CHÍNH tài khoản của họ:
 * với mỗi public."Member" chưa có hồ sơ EduConnect, tạo edu."User" (trỏ tới public."User" của họ) và edu."Student".
 * Không tạo/đổi mật khẩu nào: họ đăng nhập EduConnect bằng tên đăng nhập + mật khẩu hiện có ở khkt.
 *
 *   npx tsx scripts/adopt-khkt-members.ts           chạy thử: chỉ in số lượng, KHÔNG ghi
 *   npx tsx scripts/adopt-khkt-members.ts --apply   ghi thật (an toàn khi chạy lặp lại)
 *
 * Chỉ nhận Member (vai trò MEMBER/SECRETARY/MONITOR). Admin và tài khoản Chi đoàn của khkt KHÔNG bao giờ được nhận.
 * Biến môi trường: ADOPT_EMAIL_DOMAIN (mặc định "doan.local"): email nội bộ ghép từ mã đoàn viên, chỉ để thoả cột email của EduConnect.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const domain = process.env.ADOPT_EMAIL_DOMAIN || "doan.local";

const genderOf = (g: string | null) => {
  const v = (g ?? "").trim().toLowerCase();
  if (["nam", "male", "m"].includes(v)) return "MALE";
  if (["nữ", "nu", "female", "f"].includes(v)) return "FEMALE";
  return null;
};

async function main() {
  const members = await prisma.doanMember.findMany({
    where: { eduStudent: { is: null }, user: { role: { in: ["MEMBER", "SECRETARY", "MONITOR"] } } },
    select: { id: true, code: true, fullName: true, gender: true, dateOfBirth: true, userId: true, user: { select: { eduUser: { select: { id: true } } } } },
    orderBy: { code: "asc" },
  });
  console.log(`Đoàn viên chưa có hồ sơ EduConnect: ${members.length}${apply ? "" : "  (chạy thử, chưa ghi)"}`);
  let created = 0, linked = 0, skipped = 0;
  for (const m of members) {
    const email = `${m.code.toLowerCase()}@${domain}`;
    try {
      if (!apply) { created++; continue; }
      await prisma.$transaction(async (tx) => {
        const existingUser = m.user.eduUser;
        const user = existingUser ?? (await tx.user.create({ data: { accountId: m.userId, email, roles: ["STUDENT"] }, select: { id: true } }));
        if (existingUser) linked++;
        await tx.student.create({ data: { userId: user.id, memberId: m.id, code: m.code, fullName: m.fullName, dob: m.dateOfBirth, gender: genderOf(m.gender) } });
      });
      created++;
    } catch (e) {
      skipped++;
      console.warn(`Bỏ qua ${m.code}: ${(e as Error).message.split("\n").pop()}`);
    }
  }
  console.log(`${apply ? "Đã tạo" : "Sẽ tạo"} hồ sơ học sinh: ${created}; gắn vào người dùng EduConnect sẵn có: ${linked}; bỏ qua: ${skipped}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
