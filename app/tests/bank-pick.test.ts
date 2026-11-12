import assert from "node:assert/strict";
import { test } from "node:test";
import { difficultyQuotas, pickQuestions, splitEvenly } from "../src/modules/bank/bank.pick";
import { gradeQuestion } from "../src/modules/question/question.grading";

const q = (id: string, lessonId: string, difficulty: string) => ({ id, lessonId, difficulty });
const pool = [
  ...["e1", "e2", "e3", "e4"].map((id) => q(id, "L1", "EASY")), ...["m1", "m2", "m3"].map((id) => q(id, "L1", "MEDIUM")), q("h1", "L1", "HARD"),
  ...["x1", "x2", "x3", "x4", "x5"].map((id, i) => q(id, "L2", ["EASY", "MEDIUM", "HARD", "EASY", "MEDIUM"][i])),
];

test("chia đều số câu cho các bài, phần dư dồn cho bài đầu", () => {
  assert.deepEqual(splitEvenly(10, 3), [4, 3, 3]);
  assert.deepEqual(splitEvenly(2, 3), [1, 1, 0]);
});

test("chia số câu theo tỉ lệ độ khó và luôn đủ tổng", () => {
  assert.deepEqual(difficultyQuotas(10, { EASY: 4, MEDIUM: 4, HARD: 2 }), { EASY: 4, MEDIUM: 4, HARD: 2 });
  const q7 = difficultyQuotas(7, { EASY: 1, MEDIUM: 1, HARD: 1 });
  assert.equal(Object.values(q7).reduce((a, b) => a + b, 0), 7);
});

test("bốc theo số câu từng bài, không trùng, đúng bài, đúng tỉ lệ khi đủ câu", () => {
  const r = pickQuestions(pool, ["L1", "L2"], { perLesson: { L1: 4, L2: 3 }, difficulty: { EASY: 2, MEDIUM: 2 } });
  assert.equal(r.ids.length, 7);
  assert.equal(new Set(r.ids).size, 7);
  const l1 = r.ids.filter((id) => pool.find((p) => p.id === id)!.lessonId === "L1").map((id) => pool.find((p) => p.id === id)!.difficulty);
  assert.equal(l1.filter((d) => d === "EASY").length, 2);
  assert.equal(l1.filter((d) => d === "MEDIUM").length, 2);
  assert.deepEqual(r.shortage, []);
});

test("không đủ câu thì lấy hết có thể và báo thiếu", () => {
  const r = pickQuestions(pool, ["L1", "L2"], { perLesson: { L1: 20 } });
  assert.equal(r.ids.length, 8);
  assert.deepEqual(r.shortage, ["L1:12"]);
});

test("tổng số câu chia đều cho các bài khi không chỉ định từng bài", () => {
  const r = pickQuestions(pool, ["L1", "L2"], { total: 5 });
  assert.equal(r.ids.length, 5);
});

test("chấm điểm giữ nguyên sau khi nâng cấp: Đúng/Sai 4 ý", () => {
  const opts = ["a", "b", "c", "d"].map((id, i) => ({ id, isCorrect: i % 2 === 0 }));
  assert.equal(gradeQuestion({ type: "TRUE_FALSE_GROUP", options: opts, answerKey: null }, { picks: { a: true, b: false, c: true, d: false } }, 1).score, 1);
});
