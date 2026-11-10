import { contextFor } from "../src/infrastructure/database/unit-of-work";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import { annualSubjectAverage, semesterAverage, requiredRegularScores, suggestPromotion, learningRank, type AnnualSubject } from "../src/modules/scoring/annual";
import { requireYearStudentWriter } from "../src/modules/promotion/permission";
import { termIsLocked, assertScoreWrite } from "../src/modules/scoring/locking";
import type { SessionUser } from "../src/lib/auth/session";
const manager: SessionUser = { userId: "admin", email: "admin@example.test", roles: ["ADMIN"], teacherId: null, studentId: null };
const teacher: SessionUser = { userId: "u1", email: "teacher@example.test", roles: ["HOMEROOM_TEACHER"], teacherId: "t1", studentId: null };
const subject = (average: number, index = 0): AnnualSubject => ({ subjectId: `s${index}`, name: `Môn ${index}`, type: "SCORE", first: average, second: average, average, outcome: null, exempt: false, missing: [] });
test("annual average weights HK2 twice and does not substitute missing data with zero", () => {
  assert.equal(annualSubjectAverage(6, 9), 8); assert.equal(annualSubjectAverage(9, 6), 7);
  assert.equal(annualSubjectAverage(0, 0), 0); assert.equal(annualSubjectAverage(6, null), null);
  assert.equal(annualSubjectAverage(undefined, 9), null); assert.equal(annualSubjectAverage(7.1, 8.2), 7.8);
});
test("semester calculation requires enough regular scores and both periodic scores", () => {
  assert.deepEqual([35, 36, 70, 71].map(requiredRegularScores), [2, 3, 3, 4]);
  assert.equal(semesterAverage([8, 7, 9], 7, 8, 3), 7.8);
  assert.equal(semesterAverage([8], 7, 8, 3), null); assert.equal(semesterAverage([8, 7, 9], null, 8, 3), null);
  assert.equal(semesterAverage([0, 0], 0, 0, 2), 0);
});
test("missing evidence never defaults to promotion or good conduct", () => {
  const subjects = Array.from({ length: 7 }, (_, index) => subject(8, index));
  assert.equal(suggestPromotion(subjects, undefined, 0).result, "CHUA_DU_DIEU_KIEN");
  assert.equal(suggestPromotion(subjects, "Tốt", null).result, "CHUA_DU_DIEU_KIEN");
  assert.equal(suggestPromotion([], "Tốt", 0).result, "CHUA_DU_DIEU_KIEN");
  assert.equal(suggestPromotion(subjects, "Đạt", 45).result, "LEN_LOP");
  assert.equal(suggestPromotion(subjects, "Tốt", 46).result, "O_LAI");
  assert.equal(suggestPromotion(subjects, "Chưa đạt", 0).result, "THI_LAI");
  subjects[0].missing.push("Thiếu HK2"); assert.equal(suggestPromotion(subjects, "Tốt", 0).overallAverage, null);
});
test("learning evaluation uses subject thresholds and one-subject adjustment", () => {
  const subjects = Array.from({ length: 7 }, (_, index) => subject(8, index));
  assert.equal(learningRank(subjects), "Tốt"); subjects[6].average = 2;
  assert.equal(learningRank(subjects), "Đạt"); subjects[5].average = 2;
  assert.equal(learningRank(subjects), "Chưa đạt");
});
test("year writer authorization checks enrollment year and homeroom assignment", async () => {
  let query: unknown;
  const client = { studentClassEnrollment: { findUnique: async (input: unknown) => { query = input; return { schoolClass: { homeroomTeacherId: "t1" } }; } } } as unknown as Prisma.TransactionClient;
  await requireYearStudentWriter(teacher, "s1", "year1", contextFor(client));
  assert.deepEqual(query, { where: { studentId_academicYearId: { studentId: "s1", academicYearId: "year1" } }, include: { schoolClass: true } });
  await assert.rejects(requireYearStudentWriter({ ...teacher, teacherId: "t2" }, "s1", "year1", contextFor(client)), /không chủ nhiệm/);
  await assert.rejects(requireYearStudentWriter({ ...teacher, roles: ["SUBJECT_TEACHER"] }, "s1", "year1", contextFor(client)), /không chủ nhiệm/);
  const missing = { studentClassEnrollment: { findUnique: async () => null } } as unknown as Prisma.TransactionClient;
  await assert.rejects(requireYearStudentWriter(manager, "s1", "wrong-year", contextFor(missing)), /không thuộc năm học/);
});
test("locked periods include managers; grants target user, assignment, status and expiry", async () => {
  const term = { id: "term", isLocked: true, endDate: new Date("2026-06-01T00:00:00Z") };
  assert.equal(termIsLocked({ ...term, isLocked: false }, new Date("2026-06-17T00:00:00Z")), true);
  let grantQuery: unknown;
  const fake = (grant: unknown) => ({ classSubjectAssignment: { findUniqueOrThrow: async () => ({ academicTermId: "term", academicTerm: term, subject: {} }) }, $queryRaw: async () => [], academicTerm: { findUniqueOrThrow: async () => term }, scoreUnlockRequest: { findFirst: async (input: unknown) => { grantQuery = input; return grant; } } }) as unknown as Prisma.TransactionClient;
  await assert.rejects(assertScoreWrite(manager, "assignment1", contextFor(fake(null))), /Sổ điểm đã khóa/);
  await assertScoreWrite(manager, "assignment1", contextFor(fake({ id: "approved" })));
  const query = grantQuery as { where: { requestedBy: string; assignmentId: string; status: string; expiresAt: { gt: Date } } };
  assert.equal(query.where.requestedBy, "admin"); assert.equal(query.where.assignmentId, "assignment1"); assert.equal(query.where.status, "APPROVED"); assert.ok(query.where.expiresAt.gt instanceof Date);
});
