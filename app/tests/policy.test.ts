import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_POLICY, ratingText, ratingTone, gradeBand, normalizePolicy, policySchema, labelOf, type Policy } from "../src/lib/policy-schema";
import { learningRank, semesterAverage, suggestPromotion, type AnnualSubject } from "../src/modules/scoring/annual";

const subject = (average: number, i = 0): AnnualSubject => ({ subjectId: `s${i}`, name: `Môn ${i}`, type: "SCORE", first: average, second: average, average, outcome: null, exempt: false, missing: [] });
const clone = (): Policy => JSON.parse(JSON.stringify(DEFAULT_POLICY));

test("grade scale follows configured thresholds", () => {
  assert.equal(gradeBand(9), "Xuất sắc"); assert.equal(gradeBand(8.9), "Giỏi"); assert.equal(gradeBand(6.5), "Khá");
  assert.equal(gradeBand(4.9), "Yếu"); assert.equal(gradeBand(null), "-");
  const strict = [{ name: "A", min: 9.5 }, { name: "B", min: 7 }, { name: "C", min: 0 }];
  assert.equal(gradeBand(9, strict), "B"); assert.equal(gradeBand(9.5, strict), "A");
});

test("invalid or missing stored policy falls back to defaults", () => {
  assert.deepEqual(normalizePolicy(null), DEFAULT_POLICY);
  assert.deepEqual(normalizePolicy({ gradeScale: "hỏng" }), DEFAULT_POLICY);
  assert.equal(normalizePolicy({ promotion: { maxAbsenceDays: 30, classCapacity: 40, attentionBelow: 4 } }).promotion.maxAbsenceDays, 30);
});

test("policy validation rejects unordered scales, duplicates and bad codes", () => {
  const p = clone(); p.gradeScale[1].min = 9.5;
  assert.equal(policySchema.safeParse(p).success, false);
  const q = clone(); q.gradeScale[q.gradeScale.length - 1].min = 1;
  assert.equal(policySchema.safeParse(q).success, false);
  const r = clone(); r.learning.conductLevels = ["Tốt", "Tốt"];
  assert.equal(policySchema.safeParse(r).success, false);
  const s = clone(); s.roomTypes[0].code = "phong thuong";
  assert.equal(policySchema.safeParse(s).success, false);
  assert.equal(policySchema.safeParse(clone()).success, true);
});

test("promotion rules use configured absence limit and conduct levels", () => {
  const subjects = Array.from({ length: 7 }, (_, i) => subject(7, i));
  const p = clone(); p.promotion.maxAbsenceDays = 10;
  assert.equal(suggestPromotion(subjects, "Tốt", 11, p).result, "O_LAI");
  assert.equal(suggestPromotion(subjects, "Tốt", 10, p).result, "LEN_LOP");
  p.learning.conductLevels = ["Xuất sắc", "Ổn", "Yếu"];
  assert.equal(suggestPromotion(subjects, "Tốt", 0, p).result, "CHUA_DU_DIEU_KIEN");
  assert.equal(suggestPromotion(subjects, "Yếu", 0, p).result, "THI_LAI");
  assert.equal(suggestPromotion(subjects, "Ổn", 0, p).result, "LEN_LOP");
});

test("learning levels are configurable and small classes can still reach a level", () => {
  const five = Array.from({ length: 5 }, (_, i) => subject(9, i));
  assert.equal(learningRank(five), "Tốt"); // lớp 5 môn không còn bị kẹt ở "Chưa đạt"
  const p = clone(); p.learning.levels[0] = { ...p.learning.levels[0], name: "Xuất sắc", minEach: 9, highScore: 9, highCount: 3 };
  assert.equal(learningRank(five, p), "Xuất sắc");
  assert.equal(learningRank([subject(8), subject(8, 1), subject(8, 2)], p), "Khá");
});

test("semester average honours term weights", () => {
  assert.equal(semesterAverage([8, 7, 9], 7, 8, 3), 7.8);
  assert.equal(semesterAverage([10], 0, 0, 1, { tx: 1, gk: 1, ck: 1 }), 3.3);
  assert.equal(semesterAverage([10], 10, 0, 1, { tx: 2, gk: 1, ck: 1 }), 7.5);
});

test("catalog labels fall back to the code", () => {
  assert.equal(labelOf(DEFAULT_POLICY.roomTypes, "THI_NGHIEM"), "Phòng thí nghiệm");
  assert.equal(labelOf(DEFAULT_POLICY.roomTypes, "LA"), "LA");
});

test("diary ratings show symbol with text and colour by rank", () => {
  const r = DEFAULT_POLICY.diaryRatings;
  assert.equal(ratingText(r, "TOT"), "A · Tốt"); assert.equal(ratingText(r, "YEU"), "D · Yếu");
  assert.equal(ratingText(r, null), "-"); assert.equal(ratingText(r, "CU"), "CU");
  assert.match(ratingTone(r, "TOT"), /green/); assert.match(ratingTone(r, "YEU"), /red/); assert.match(ratingTone(r, "CU"), /slate/);
  const dup = clone(); dup.diaryRatings[1].symbol = "A";
  assert.equal(policySchema.safeParse(dup).success, false);
});

test("only admin or principal may lock or publish grades", async () => {
  const { setGradesVisibility } = await import("../src/modules/scoring/grade-visibility.service");
  const user = (roles: string[]) => ({ userId: "u", email: "u@example.test", roles, teacherId: null, studentId: null }) as never;
  for (const roles of [["VICE_PRINCIPAL"], ["SUBJECT_TEACHER"], ["STUDENT"]]) await assert.rejects(setGradesVisibility(user(roles), { termId: "t", hide: true }), /Admin và Hiệu trưởng/);
});

test("year view combines HK1 and HK2 with the (HK1 + 2×HK2)/3 formula", async () => {
  const { buildYearRows, meanOf } = await import("../src/modules/scoring/year-view");
  const rows = buildYearRows([
    { subjectId: "t", subjectName: "Toán", termName: "HK1", value: 6.04 }, { subjectId: "t", subjectName: "Toán", termName: "HK2", value: 9 },
    { subjectId: "v", subjectName: "Vật lý", termName: "HK1", value: 8 },
    { subjectId: "a", subjectName: "Anh", termName: "HK2", value: 7 },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.subjectId, r]));
  assert.deepEqual([by.t.hk1, by.t.hk2, by.t.year], [6, 9, 8]);
  assert.equal(by.v.year, null); assert.equal(by.a.year, null); // thiếu một kỳ → chưa tính cả năm
  assert.equal(meanOf(rows.map((r) => r.year)), 8); assert.equal(meanOf([null]), null);
});
