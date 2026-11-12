#!/usr/bin/env node
/**
 * Sinh prisma/schema.prisma = phần EduConnect (prisma/edu.prisma, schema Postgres "edu")
 *                          + bản sao các model của Cổng thông tin Đoàn (khkt, schema "public").
 *
 * Vì sao có bản sao: Prisma chỉ cho khoá ngoại giữa các bảng nếu cả hai model đều có trong schema.
 * Bản sao được đổi tên (tiền tố "Doan", giữ nguyên tên bảng bằng @@map) để không trùng tên với model EduConnect
 * (User, Notification, QuizAttempt, Role...), và KHÔNG BAO GIỜ được sửa tay.
 *
 * Nguồn bản sao: prisma/vendor/khkt.schema.prisma (chép nguyên từ prisma/schema.prisma của khkt).
 *   node scripts/build-schema.mjs            sinh lại schema.prisma
 *   node scripts/build-schema.mjs --check    thoát mã 1 nếu schema.prisma đang commit không khớp (dùng trong CI)
 *   node scripts/build-schema.mjs --khkt ../../khkt-congthongtindoan/prisma/schema.prisma   kiểm tra bản vendor còn khớp khkt
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = (f) => join(root, "prisma", f);
const PREFIX = "Doan";

// Trường quan hệ ngược mà Prisma bắt buộc phải có trên model khkt (không tạo cột nào trong DB khkt).
const BACK_RELATIONS = {
  User: ["  eduUser User? // EduConnect: hồ sơ riêng của tài khoản này"],
  Member: ["  eduStudent Student? // EduConnect: hồ sơ học sinh"],
  SchoolYear: ["  eduYear AcademicYear? // EduConnect: năm học tương ứng"],
  Department: ["  eduClasses SchoolClass[] // EduConnect: lớp (chi đoàn chính là lớp)"],
};

export function buildDoanCopy(src) {
  const names = [...src.matchAll(/^(?:model|enum) (\w+) \{/gm)].map((m) => m[1]);
  const nameSet = new Set(names);
  const out = [];
  let cur = null; // { kind, name }
  for (const line of src.split("\n")) {
    const head = line.match(/^(model|enum) (\w+) \{/);
    if (head) {
      cur = { kind: head[1], name: head[2] };
      out.push(`${head[1]} ${PREFIX}${head[2]} {`);
      continue;
    }
    if (!cur) continue; // bỏ generator/datasource của khkt
    if (line === "}") {
      for (const extra of cur.kind === "model" ? BACK_RELATIONS[cur.name] ?? [] : []) out.push(extra);
      out.push(`  @@map("${cur.name}")`, `  @@schema("public")`, "}");
      cur = null;
      continue;
    }
    // đổi kiểu của trường (token thứ 2) nếu là model/enum nội bộ của khkt
    const f = line.match(/^(\s+)(\w+)(\s+)(\w+)(\?|\[\])?(.*)$/);
    if (f && !line.trim().startsWith("@@") && !line.trim().startsWith("//") && nameSet.has(f[4])) {
      out.push(`${f[1]}${f[2]}${f[3]}${PREFIX}${f[4]}${f[5] ?? ""}${f[6]}`);
    } else out.push(line);
  }
  return out.join("\n");
}

export function buildSchema() {
  const khkt = readFileSync(P("vendor/khkt.schema.prisma"), "utf8");
  const edu = readFileSync(P("edu.prisma"), "utf8");
  const header = `// =====================================================================================
// TỆP ĐƯỢC SINH TỰ ĐỘNG bởi scripts/build-schema.mjs — KHÔNG SỬA TAY.
//   Sửa phần EduConnect ở prisma/edu.prisma, rồi chạy: npm run db:schema
//   Phần "Doan*" là bản sao schema Cổng thông tin Đoàn (khkt) lấy từ prisma/vendor/khkt.schema.prisma.
// Hai schema Postgres: "edu" (bảng của EduConnect) và "public" (bảng của khkt, EduConnect chỉ tham chiếu).
// QUY TẮC: không chạy migrate/db push của EduConnect lên "public" (xem docs/db-dung-chung.md).
// =====================================================================================
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas   = ["public", "edu"]
}
`;
  return `${header}\n// ───────────── EduConnect (schema "edu") ─────────────\n${edu.trim()}\n\n// ───────────── Bản sao Cổng thông tin Đoàn (schema "public") ─────────────\n${buildDoanCopy(khkt).trim()}\n`;
}

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const args = process.argv.slice(2);
const next = buildSchema();
const khktIdx = args.indexOf("--khkt");
if (khktIdx >= 0) {
  const live = readFileSync(args[khktIdx + 1], "utf8");
  const vendored = readFileSync(P("vendor/khkt.schema.prisma"), "utf8");
  if (live !== vendored) {
    console.error(`✖ prisma/vendor/khkt.schema.prisma (${sha(vendored)}) KHÁC schema hiện tại của khkt (${sha(live)}). Chép lại rồi chạy npm run db:schema.`);
    process.exit(1);
  }
  console.log(`✔ bản vendor khớp schema khkt (${sha(live)})`);
}
if (args.includes("--check")) {
  const cur = readFileSync(P("schema.prisma"), "utf8");
  if (cur !== next) { console.error("✖ prisma/schema.prisma không khớp edu.prisma + vendor. Chạy: npm run db:schema"); process.exit(1); }
  console.log("✔ schema.prisma khớp");
} else if (khktIdx < 0) {
  writeFileSync(P("schema.prisma"), next);
  console.log(`✔ đã sinh prisma/schema.prisma (${sha(next)})`);
}
