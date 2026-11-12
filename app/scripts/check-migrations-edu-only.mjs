#!/usr/bin/env node
/**
 * Bảo vệ Cổng thông tin Đoàn (khkt): migration của EduConnect chỉ được thay đổi schema "edu".
 * Mọi câu DDL (CREATE/ALTER/DROP TABLE|INDEX|TYPE|...) trong prisma/migrations/** phải trỏ tới "edu"."...".
 * Chạy trong CI: node scripts/check-migrations-edu-only.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "migrations");
const bad = [];
for (const m of readdirSync(dir)) {
  const f = join(dir, m, "migration.sql");
  try { if (!statSync(f).isFile()) continue; } catch { continue; }
  const sql = readFileSync(f, "utf8").replace(/\$\$[\s\S]*?\$\$/g, "").replace(/--.*$/gm, "");
  for (const stmt of sql.split(";")) {
    const s = stmt.trim().replace(/\s+/g, " ");
    if (!/^(CREATE|ALTER|DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i.test(s)) continue;
    if (/^CREATE (SCHEMA|OR REPLACE FUNCTION)/i.test(s) || /^CREATE TRIGGER .* ON edu\./i.test(s) || /^DROP TRIGGER IF EXISTS \w+ ON edu\./i.test(s)) continue;
    // Duy nhất được phép chạm public: trigger đồng bộ có tiền tố sync_ trên các bảng dùng chung (không đổi bảng/cột nào của khkt).
    if (/^CREATE TRIGGER sync_\w+ .* ON public\."(SchoolYear|Department|Member)"/i.test(s) || /^DROP TRIGGER IF EXISTS sync_\w+ ON public\."(SchoolYear|Department|Member)"/i.test(s)) continue;
    if (!/"edu"\./.test(s.split(/ (REFERENCES|USING|FROM) /i)[0]) && !/ edu\./.test(s.split(" ").slice(0, 8).join(" "))) bad.push(`${m}: ${s.slice(0, 110)}`);
  }
}
if (bad.length) { console.error("✖ Migration chạm schema ngoài edu (có thể làm hỏng khkt):\n  " + bad.join("\n  ")); process.exit(1); }
console.log("✔ mọi migration chỉ thay đổi schema edu");
