import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDocx } from "../src/modules/importer/docx-parser";
import { buildDocx } from "./importer-docx-fixture";

test("docx: công thức OMML -> LaTeX, ảnh nhúng -> [[IMG:n]], gạch chân, bảng", async () => {
  const parsed = await parseDocx(await buildDocx());
  const lines = parsed.text.split("\n");
  assert.match(lines[0], /^Câu 1\. Tính giá trị biểu thức \$\\frac\{a\}\{b\}\$ và \$\\sqrt\{x\+1\}\$\.$/);
  assert.ok(lines[1].includes("$x^{2}\\leq \\pi$") || lines[1].includes("$x^{2}\\leq\\pi$"), "sup/≤/π: " + lines[1]);
  assert.ok(lines[1].includes("\\int_{0}^{1}x") || lines[1].includes("\\int_{0}^{1} x"), "integral: " + lines[1]);
  assert.ok(lines[1].includes("<u>C. đáp án gạch chân</u>"), "underline");
  assert.ok(lines[1].includes("\\sin x"), "func: " + lines[1]);
  assert.equal(lines[2], "Câu 2. Cho hình vẽ bên: [[IMG:1]]");
  assert.equal(lines[3], "A. [[IMG:1]] B. [[IMG:2]]");
  assert.ok(lines[4].includes("\\left\\{") && lines[4].includes("\\begin{aligned}") && lines[4].includes("\\right."), "system: " + lines[4]);
  assert.equal(lines[5], "| Câu | 1 | 2 |");
  assert.equal(lines[6], "| Đáp án | C | B |");
  assert.equal(parsed.images.length, 2);
  assert.ok(parsed.images.every((i) => i.supported && i.mime === "image/png" && i.data.length > 20));
});
