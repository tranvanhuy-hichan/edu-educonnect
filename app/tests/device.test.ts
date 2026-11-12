import assert from "node:assert/strict";
import { test } from "node:test";
import { describeDevice, maskIp } from "../src/lib/auth/device";

test("device description is human readable and IPs are masked", () => {
  assert.equal(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit Chrome/120 Safari/537 Edg/120"), "Edge trên Windows");
  assert.equal(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Safari/604"), "Safari trên iOS");
  assert.equal(describeDevice("Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0"), "Firefox trên Linux");
  assert.equal(describeDevice(""), "Thiết bị không rõ");
  assert.equal(maskIp("113.161.22.9"), "113.161.*.*");
  assert.equal(maskIp("2001:db8:85a3::8a2e:370:7334"), "2001:db8::*");
  assert.equal(maskIp(null), "không rõ");
  assert.equal(maskIp("unknown"), "không rõ");
});
