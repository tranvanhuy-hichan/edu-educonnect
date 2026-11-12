/**
 * Nhập tài khoản NHÂN SỰ EduConnect (quản trị, hiệu trưởng/phó, giáo viên, thủ thư) vào DB dùng chung với Cổng Đoàn.
 * Mỗi người có 1 tài khoản dùng chung public."User" (vai trò khkt EXTERNAL: không vào được Cổng Đoàn) + hồ sơ edu."User" (+ edu."Teacher" nếu có mã giáo viên).
 * KHÔNG mang mật khẩu cũ: sinh mật khẩu tạm MỚI, bắt đổi ở lần đăng nhập đầu. Thông tin đăng nhập ghi ra --out (quyền 600), không in ra màn hình.
 *
 *   npx tsx scripts/import-staff-accounts.ts --file staff.json                       chạy thử (không ghi)
 *   npx tsx scripts/import-staff-accounts.ts --file staff.json --out creds.csv --apply
 * Tệp vào: mảng { email, roles[], isActive, fullName?, teacherCode?, phone?, gender?, contactEmail? }. Chạy lặp lại an toàn (bỏ qua người đã có).
 */
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient, type Role } from "@prisma/client";
import { genPassword } from "../src/lib/password";

const prisma = new PrismaClient();
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const apply = process.argv.includes("--apply");
const file = arg("--file"), out = arg("--out");
type Row = { email: string; roles: Role[]; isActive?: boolean; fullName?: string | null; teacherCode?: string | null; phone?: string | null; gender?: string | null; contactEmail?: string | null };

async function main() {
  if (!file) throw new Error("Thiếu --file");
  if (apply && !out) throw new Error("--apply cần --out (nơi ghi mật khẩu tạm)");
  const rows: Row[] = JSON.parse(readFileSync(file, "utf8"));
  const creds: string[] = ["email,tenDangNhap,matKhauTam,vaiTro"];
  let created = 0, skipped = 0;
  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    if (r.roles.includes("STUDENT")) { console.log(`Bỏ qua học sinh: ${email}`); skipped++; continue; }
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) { console.log(`Đã có: ${email}`); skipped++; continue; }
    const username = r.teacherCode || email;
    const fullName = r.fullName || email.split("@")[0];
    if (!apply) { console.log(`Sẽ tạo: ${email} [${r.roles.join(",")}] đăng nhập=${username}${r.teacherCode ? " (giáo viên)" : ""}`); created++; continue; }
    const password = genPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction(async (tx) => {
      const account = await tx.doanUser.create({ data: { username, passwordHash, fullName, role: "EXTERNAL", mustChangePassword: true }, select: { id: true } });
      await tx.user.create({
        data: {
          accountId: account.id, email, roles: r.roles, isActive: r.isActive ?? true,
          ...(r.teacherCode ? { teacher: { create: { code: r.teacherCode, fullName, phone: r.phone ?? null, gender: r.gender ?? null, contactEmail: r.contactEmail ?? null } } } : {}),
        },
      });
    });
    creds.push([email, username, password, r.roles.join("+")].join(","));
    created++;
  }
  if (apply) { writeFileSync(out!, creds.join("\n") + "\n", { mode: 0o600 }); chmodSync(out!, 0o600); }
  console.log(`${apply ? "Đã tạo" : "Sẽ tạo"}: ${created}; bỏ qua: ${skipped}${apply ? `. Mật khẩu tạm ghi ở ${out} (quyền 600), mọi người bị buộc đổi mật khẩu lần đầu.` : "  (chạy thử, chưa ghi)"}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
