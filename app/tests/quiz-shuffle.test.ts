import assert from "node:assert/strict";
import { test } from "node:test";
import { arrangeForStudent, canShuffleOptions, seededRandom, shuffleSeeded } from "../src/modules/question/quiz-shuffle";

const opt = (id: string, content: string, label: string) => ({ id, label, content, isCorrect: false });
const item = (id: string, type = "SINGLE_CHOICE", contents = ["một", "hai", "ba", "bốn"]) => ({ id, question: { id: `q${id}`, type, options: contents.map((c, i) => opt(`${id}o${i}`, c, "ABCD"[i])) } });
const items = Array.from({ length: 12 }, (_, i) => item(String(i)));

test("cùng hạt giống cho cùng thứ tự, khác hạt giống cho thứ tự khác", () => {
  assert.deepEqual(shuffleSeeded([1, 2, 3, 4, 5, 6, 7, 8], "a"), shuffleSeeded([1, 2, 3, 4, 5, 6, 7, 8], "a"));
  const orders = new Set(Array.from({ length: 30 }, (_, i) => shuffleSeeded([1, 2, 3, 4, 5, 6, 7, 8], `hs${i}`).join()));
  assert.ok(orders.size > 25, "30 học sinh phải có (gần như) 30 thứ tự khác nhau");
  const r = seededRandom("x"); const v = Array.from({ length: 1000 }, r); assert.ok(v.every((x) => x >= 0 && x < 1));
});

test("xáo trộn là hoán vị: không mất, không trùng câu hay đáp án", () => {
  const out = arrangeForStudent(items, { questions: true, options: true }, "ex1:hs1");
  assert.deepEqual(out.map((x) => x.id).sort(), items.map((x) => x.id).sort());
  for (const it of out) assert.deepEqual(it.question.options.map((o) => o.id).sort(), items.find((x) => x.id === it.id)!.question.options.map((o) => o.id).sort());
});

test("ổn định theo học sinh, khác nhau giữa các học sinh", () => {
  const a1 = arrangeForStudent(items, { questions: true, options: true }, "ex1:hs1").map((x) => x.id).join();
  const a2 = arrangeForStudent(items, { questions: true, options: true }, "ex1:hs1").map((x) => x.id).join();
  const b = arrangeForStudent(items, { questions: true, options: true }, "ex1:hs2").map((x) => x.id).join();
  assert.equal(a1, a2); assert.notEqual(a1, b);
});

test("nhãn đáp án được đánh lại theo vị trí mới (A-D, và a-d cho Đúng/Sai)", () => {
  const out = arrangeForStudent([item("1"), item("2", "TRUE_FALSE_GROUP")], { questions: false, options: true }, "s");
  assert.deepEqual(out[0].question.options.map((o) => o.label), ["A", "B", "C", "D"]);
  assert.deepEqual(out[1].question.options.map((o) => o.label), ["a", "b", "c", "d"]);
});

test("chỉ bật xáo câu hỏi thì đáp án giữ nguyên; chỉ bật xáo đáp án thì câu hỏi giữ nguyên; tắt cả hai thì không đổi", () => {
  const q = arrangeForStudent(items, { questions: true, options: false }, "s");
  assert.deepEqual(q.map((x) => x.question.options.map((o) => o.id)), q.map((x) => items.find((i) => i.id === x.id)!.question.options.map((o) => o.id)));
  const o = arrangeForStudent(items, { questions: false, options: true }, "s");
  assert.deepEqual(o.map((x) => x.id), items.map((x) => x.id));
  assert.equal(arrangeForStudent(items, { questions: false, options: false }, "s"), items);
});

test("đáp án tham chiếu đáp án khác thì không xáo đáp án của câu đó", () => {
  assert.equal(canShuffleOptions([{ content: "1" }, { content: "Cả A và B đều đúng" }]), false);
  assert.equal(canShuffleOptions([{ content: "Tất cả các đáp án trên" }]), false);
  assert.equal(canShuffleOptions([{ content: "Không có đáp án nào đúng" }]), false);
  assert.equal(canShuffleOptions([{ content: "10 m" }, { content: "20 m" }]), true);
  const guarded = item("9", "SINGLE_CHOICE", ["x", "y", "z", "Cả A và B đều đúng"]);
  const out = arrangeForStudent([guarded], { questions: false, options: true }, "bất kỳ");
  assert.deepEqual(out[0].question.options.map((o) => o.id), guarded.question.options.map((o) => o.id));
});

test("thêm câu hỏi mới không làm đổi thứ tự đáp án của các câu cũ (hạt giống theo từng câu)", () => {
  const before = arrangeForStudent(items, { questions: false, options: true }, "s").map((x) => x.question.options.map((o) => o.id).join());
  const after = arrangeForStudent([...items, item("99")], { questions: false, options: true }, "s").slice(0, items.length).map((x) => x.question.options.map((o) => o.id).join());
  assert.deepEqual(before, after);
});
