import assert from "node:assert/strict";
import { test } from "node:test";
import { phoneKeyOf } from "../src/modules/notification/parent-notification.service";
import { describeScores, newlyAbsent, scoresDiffer } from "../src/modules/notification/guardian-events";

test("guardian phone key matches the same number written in different ways and rejects junk", () => {
  const key = "912345678";
  for (const raw of ["0912345678", "0912 345 678", "091.234.5678", "+84 912 345 678", "84912345678", "912345678"]) assert.equal(phoneKeyOf(raw), key, raw);
  assert.equal(phoneKeyOf(""), null);
  assert.equal(phoneKeyOf(null), null);
  assert.equal(phoneKeyOf("123"), null);
  assert.equal(phoneKeyOf("không có"), null);
});

test("score change detection ignores order and untouched rows; description lists only filled columns", () => {
  assert.equal(scoresDiffer({ tx: [8, 9], gk: 7, ck: null }, { tx: [9, 8], gk: 7, ck: null }), false);
  assert.equal(scoresDiffer({ tx: [8, 9], gk: 7, ck: null }, { tx: [8, 9], gk: 7, ck: 6 }), true);
  assert.equal(scoresDiffer({ tx: [8], gk: null, ck: null }, { tx: [8, 10], gk: null, ck: null }), true);
  assert.equal(scoresDiffer({ tx: [10, 9], gk: null, ck: null }, { tx: [9, 10], gk: null, ck: null }), false);
  assert.equal(describeScores({ tx: [8, 9.5], gk: 7, ck: null }), "TX 8; 9,5 · GK 7");
  assert.equal(describeScores({ tx: [], gk: null, ck: 6.25 }), "CK 6,25");
  assert.equal(describeScores({ tx: [], gk: null, ck: null }), "chưa có điểm");
});

test("absence notices go only to students newly marked absent", () => {
  const next = [{ studentId: "a", excused: false }, { studentId: "b", excused: true }];
  assert.deepEqual(newlyAbsent([], next).map((x) => x.studentId), ["a", "b"]);
  assert.deepEqual(newlyAbsent(["a"], next).map((x) => x.studentId), ["b"]);
  assert.deepEqual(newlyAbsent(["a", "b"], next), []);
  assert.deepEqual(newlyAbsent(["a", "b", "c"], []), []);
});
