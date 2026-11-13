import assert from "node:assert/strict";
import test from "node:test";
import { forbiddenSharedAccount } from "../src/lib/auth/shared-account";
test("BCH rights never grant Edu access without a teacher; superadmin and students stay isolated", () => {
  const u = { accountRole: "ADMIN", accountSuperAdmin: false, teacher: { id: "t" }, roles: ["SUBJECT_TEACHER"] };
  assert.equal(forbiddenSharedAccount(u), false);
  assert.equal(forbiddenSharedAccount({ ...u, teacher: null }), true);
  assert.equal(forbiddenSharedAccount({ ...u, accountSuperAdmin: true }), true);
  assert.equal(forbiddenSharedAccount({ ...u, roles: ["STUDENT"] }), true);
  assert.equal(forbiddenSharedAccount({ ...u, accountRole: "DEPARTMENT_ACCOUNT" }), true);
  assert.equal(forbiddenSharedAccount({ ...u, accountRole: "EXTERNAL" }), false);
});
