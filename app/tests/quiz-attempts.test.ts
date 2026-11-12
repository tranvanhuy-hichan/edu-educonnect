import assert from "node:assert/strict";
import { test } from "node:test";
import { attemptsLeft, canRevealAnswers, deadlineOf, formatClock, isOvertime, shouldReplaceSummary, shuffleSeedFor, TIME_GRACE_MS, timeLeftMs } from "../src/modules/question/quiz-attempts";

test("số lượt còn lại", () => { assert.equal(attemptsLeft(3, 1), 2); assert.equal(attemptsLeft(1, 1), 0); assert.equal(attemptsLeft(1, 5), 0); });

test("tính điểm nhiều lần: cao nhất / lần cuối", () => {
  assert.equal(shouldReplaceSummary("BEST", null, 3), true, "chưa có kết quả thì luôn lấy");
  assert.equal(shouldReplaceSummary("BEST", 8, 6), false);
  assert.equal(shouldReplaceSummary("BEST", 6, 8), true);
  assert.equal(shouldReplaceSummary("BEST", 6, 6), false, "bằng điểm thì giữ lần trước");
  assert.equal(shouldReplaceSummary("LAST", 8, 2), true);
});

test("giờ làm bài: còn lại, quá hạn có thời gian du di, 0 phút = không giới hạn", () => {
  const start = new Date("2026-11-12T08:00:00Z");
  assert.equal(deadlineOf(start, 15).toISOString(), "2026-11-12T08:15:00.000Z");
  assert.equal(timeLeftMs(start, 15, new Date("2026-11-12T08:10:00Z")), 5 * 60_000);
  assert.equal(isOvertime(start, 15, new Date("2026-11-12T08:15:30Z")), false, "trễ 30 giây vẫn nhận");
  assert.equal(isOvertime(start, 15, new Date(deadlineOf(start, 15).getTime() + TIME_GRACE_MS + 1000)), true);
  assert.equal(isOvertime(start, 0, new Date("2030-01-01")), false);
  assert.equal(timeLeftMs(start, 0), Infinity);
});

test("hạt giống xáo đề: lần 1 giữ như cũ, các lần sau khác nhau", () => {
  assert.equal(shuffleSeedFor("e", "s", 1), "e:s");
  assert.notEqual(shuffleSeedFor("e", "s", 2), shuffleSeedFor("e", "s", 3));
});

test("chỉ hiện đáp án đúng khi đã nộp, hết lượt làm lại và đúng cài đặt", () => {
  const base = { showAnswers: "AFTER_SUBMIT", dueDate: null, submitted: true, attemptsLeft: 0 };
  assert.equal(canRevealAnswers(base), true);
  assert.equal(canRevealAnswers({ ...base, attemptsLeft: 1 }), false, "còn lượt làm lại thì chưa hiện");
  assert.equal(canRevealAnswers({ ...base, submitted: false }), false);
  assert.equal(canRevealAnswers({ ...base, showAnswers: "NEVER" }), false);
  const due = new Date("2026-12-31T00:00:00Z");
  assert.equal(canRevealAnswers({ ...base, showAnswers: "AFTER_DUE", dueDate: due, now: new Date("2026-12-30T00:00:00Z") }), false);
  assert.equal(canRevealAnswers({ ...base, showAnswers: "AFTER_DUE", dueDate: due, now: new Date("2027-01-02T00:00:00Z") }), true);
  assert.equal(canRevealAnswers({ ...base, showAnswers: "AFTER_DUE", dueDate: null }), true);
});

test("đồng hồ hiển thị", () => { assert.equal(formatClock(65_000), "1:05"); assert.equal(formatClock(3_725_000), "1:02:05"); assert.equal(formatClock(-5), "0:00"); });
