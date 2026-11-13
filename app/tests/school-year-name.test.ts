import assert from "node:assert/strict";
import test from "node:test";
import { schoolYearIdentity } from "../src/modules/academic/school-year-name";
test("year names with displayed dashes keep the same shared identifier; invalid cohorts cannot silently lose sync",()=>{
  for(const name of ["2026-2027","2026–2027"," Năm học 2026 – 2027 ","2026/2027"])
    assert.deepEqual(schoolYearIdentity(name),{schoolYear:2026,yearName:"2026-2027"});
  for(const name of ["2026-2028","2026","Năm mới","2027-2026"])assert.throws(()=>schoolYearIdentity(name));
});
