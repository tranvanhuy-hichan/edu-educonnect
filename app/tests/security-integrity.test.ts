import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { credentialTag, matchesCredential } from "../src/lib/auth/credential-tag";
import { readBoundedBody, BodyTooLargeError } from "../src/lib/storage/bounded-body";
import { parseDocx } from "../src/modules/importer/docx-parser";

test("password changes revoke credential tags and legacy sessions fail closed", () => {
  process.env.JWT_SECRET = "test-secret-only";
  const tag = credentialTag("old-password-hash");
  assert.equal(matchesCredential(tag, "old-password-hash"), true);
  assert.equal(matchesCredential(tag, "new-password-hash"), false);
  assert.equal(matchesCredential(undefined, "old-password-hash"), false);
  assert.equal(matchesCredential("invalid", "old-password-hash"), false);
});
test("bounded multipart reader rejects chunked oversized requests without content-length", async () => {
  let cancelled = false;
  const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(16)); }, cancel() { cancelled = true; } });
  const req = new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit);
  await assert.rejects(readBoundedBody(req, 32), BodyTooLargeError);
  assert.equal(cancelled, true);
  assert.equal((await readBoundedBody(new Request("http://localhost", { method: "POST", body: "hello" }), 5)).length, 5);
});
test("DOCX rejects expanded XML and deeply nested or entity-bearing documents", async () => {
  for (const xml of ["x".repeat(8 * 1024 * 1024 + 1), "<w:p>".repeat(101) + "</w:p>".repeat(101), '<!DOCTYPE x [<!ENTITY a "x">]><x/>']) {
    const zip = new JSZip(); zip.file("word/document.xml", xml);
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await assert.rejects(parseDocx(buffer), /giới hạn|phức tạp|DTD/);
  }
});

 test("promotion keeps repeating students in grade, advances one grade and rejects final-grade promotion", async () => {
  const { assertGradeProgression } = await import("../src/modules/promotion/grade-progression");
  const grades = [{ id: "12", sortOrder: 12 }, { id: "10", sortOrder: 10 }, { id: "11", sortOrder: 11 }];
  assert.doesNotThrow(() => assertGradeProgression(grades, "10", "10", "O_LAI"));
  assert.doesNotThrow(() => assertGradeProgression(grades, "10", "11", "LEN_LOP"));
  for (const [from, to, result] of [["10", "11", "O_LAI"], ["10", "12", "LEN_LOP"], ["12", "12", "LEN_LOP"], ["missing", "10", "LEN_LOP"]]) {
    assert.throws(() => assertGradeProgression(grades, from, to, result));
  }
});
