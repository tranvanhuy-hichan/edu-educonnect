import assert from "node:assert/strict";
import { test } from "node:test";
import { tomorrowRangeVN } from "../src/modules/reminders/reminders.service";

test("tomorrow range is the next Vietnam calendar day, including around midnight and month/year boundaries", () => {
  // 20:00 giờ VN ngày 12/11 (13:00Z) → ngày mai là 13/11 giờ VN = [12/11 17:00Z, 13/11 17:00Z)
  const a = tomorrowRangeVN(new Date("2026-11-12T13:00:00Z"));
  assert.equal(a.start.toISOString(), "2026-11-12T17:00:00.000Z");
  assert.equal(a.end.toISOString(), "2026-11-13T17:00:00.000Z");
  // 23:30 giờ VN (16:30Z) vẫn là ngày 12 theo giờ VN
  assert.equal(tomorrowRangeVN(new Date("2026-11-12T16:30:00Z")).start.toISOString(), "2026-11-12T17:00:00.000Z");
  // 00:10 giờ VN ngày 13 (17:10Z ngày 12): ngày mai là 14
  assert.equal(tomorrowRangeVN(new Date("2026-11-12T17:10:00Z")).start.toISOString(), "2026-11-13T17:00:00.000Z");
  // cuối năm
  assert.equal(tomorrowRangeVN(new Date("2026-12-31T05:00:00Z")).start.toISOString(), "2026-12-31T17:00:00.000Z");
  assert.equal(tomorrowRangeVN(new Date("2026-12-31T20:00:00Z")).start.toISOString(), "2027-01-01T17:00:00.000Z");
});
