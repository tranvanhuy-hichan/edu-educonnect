import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNav } from "../src/lib/nav";
import { PAGE_HELP, ROLE_GUIDES, guidesFor, helpFor } from "../src/lib/help-content";

const ROLES = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN", "STUDENT"] as const;
const flat = (items: { href: string; children?: unknown[] }[]): string[] => items.flatMap((i) => [i.href, ...(i.children ? flat(i.children as { href: string; children?: unknown[] }[]) : [])]);

test("every page reachable from any role's menu has an in-app help entry", () => {
  const missing = new Set<string>();
  for (const role of ROLES) for (const g of buildNav([role])) for (const href of flat(g.items)) {
    if (href.startsWith("#")) continue; // tiêu đề nhóm menu, không phải trang
    const path = href.split("?")[0];
    if (!helpFor(path)) missing.add(path);
  }
  assert.deepEqual([...missing], [], "Thiếu hướng dẫn cho: " + [...missing].join(", "));
});

test("help lookup prefers the most specific page and the home page only matches exactly", () => {
  assert.equal(helpFor("/tai-khoan/ra-soat")?.title, "Rà soát tài khoản");
  assert.equal(helpFor("/tai-khoan/abc123")?.title, "Tài khoản");
  assert.equal(helpFor("/lop-hoc/xyz/sua")?.title, "Lớp học");
  assert.equal(helpFor("/")?.title, "Trang chủ");
  assert.equal(helpFor("/khong-co-trang-nay"), null);
  assert.equal(helpFor("/hoc-sinh?tab=all")?.title, "Học sinh");
});

test("every role has a first-time guide whose links point to real help pages, and multi-role users get all their guides", () => {
  for (const role of ROLES) {
    const g = ROLE_GUIDES[role];
    assert.ok(g.steps.length >= 3, role);
    for (const s of g.steps) if (s.href) assert.ok(helpFor(s.href), `${role}: ${s.href}`);
  }
  assert.deepEqual(guidesFor(["SUBJECT_TEACHER", "HOMEROOM_TEACHER"]).map((g) => g.role), ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"]);
  assert.equal(PAGE_HELP.length, new Set(PAGE_HELP.map((p) => p.match)).size, "không trùng mục");
});
