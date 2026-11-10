import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMobileNav, buildNav } from "../src/lib/nav";
import type { Role } from "../src/lib/guard";

for (const role of ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"] as Role[]) {
  test(`${role}: bottom bar prioritizes classes, timetable, diary and scoring`, () => {
    assert.deepEqual(buildMobileNav([role]).map((item) => item.href), ["/", "/lop-hoc", "/lich-hoc", "/so-dau-bai", "/nhap-diem"]);
  });
}
for (const roles of [["STUDENT"], ["LIBRARIAN"], ["HOMEROOM_TEACHER"], ["SUBJECT_TEACHER"], ["HOMEROOM_TEACHER", "SUBJECT_TEACHER"]] as Role[][]) {
  test(`${roles.join(" + ")}: five distinct shortcuts stay within the available navigation`, () => {
    const allowed = new Set(buildNav(roles).flatMap((group) => group.items.flatMap((item) => item.children ?? [item])).map((item) => item.href));
    const items = buildMobileNav(roles);
    assert.equal(items.length, 5);
    assert.equal(new Set(items.map((item) => item.href)).size, 5);
    assert.equal(items[0].href, "/");
    assert.ok(items.every((item) => item.href === "/" || allowed.has(item.href)));
    if (roles.includes("STUDENT")) assert.ok(items.every((item) => !["/lop-hoc", "/so-dau-bai", "/nhap-diem"].includes(item.href)));
  });
}
