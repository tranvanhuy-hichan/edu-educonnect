import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { createApiKey, revokeApiKey, rotateApiKey, hashKey } from "../src/modules/apikeys/api-key.service";
import { GET as me } from "../src/app/api/v1/me/route";
import { GET as grades } from "../src/app/api/v1/grades/route";
import { GET as years } from "../src/app/api/v1/academic-years/route";
import { GET as classes } from "../src/app/api/v1/classes/route";
import { GET as classOne } from "../src/app/api/v1/classes/[id]/route";
import { GET as classStudents } from "../src/app/api/v1/classes/[id]/students/route";
import { GET as students } from "../src/app/api/v1/students/route";
import { GET as studentOne } from "../src/app/api/v1/students/[id]/route";
import { GET as teachers } from "../src/app/api/v1/teachers/route";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });

const admin = { userId: "t-admin", email: "t-admin@test.invalid", roles: ["ADMIN" as const], teacherId: null, studentId: null };
const ALL = ["years:read", "grades:read", "classes:read", "students:read", "teachers:read"];
let ipCounter = 0;
const freshIp = () => `203.0.113.${(++ipCounter % 250) + 1}`;
type Handler = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const call = async (h: Handler, path: string, key: string | null, opts: { ip?: string; params?: Record<string, string>; headers?: Record<string, string> } = {}) => {
  const headers: Record<string, string> = { "x-real-ip": opts.ip ?? "198.51.100.7", ...(key ? { authorization: `Bearer ${key}` } : {}), ...opts.headers };
  const res = await h(new Request(`http://localhost${path}`, { headers }), opts.params ? { params: Promise.resolve(opts.params) } : undefined);
  return { status: res.status, headers: res.headers, body: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const clean = async (ids: string[]) => { await prisma.apiKey.deleteMany({ where: { id: { in: ids } } }); await prisma.$executeRaw`DELETE FROM "LoginThrottle" WHERE "key" IS NOT NULL`; };

test("database: authentication rejects missing, malformed, unknown, revoked and expired keys with stable error codes", { skip: !enabled }, async () => {
  const { row, secret } = await createApiKey(admin, { name: "T auth", scopes: ALL });
  const ids = [row.id];
  try {
    assert.deepEqual((await call(me, "/api/v1/me", null)).body.error.code, "missing_api_key");
    assert.equal((await call(me, "/api/v1/me", "khong-dung-dinh-dang")).body.error.code, "invalid_api_key");
    assert.equal((await call(me, "/api/v1/me", "ek_" + "A".repeat(32))).status, 401);
    assert.equal((await call(me, `/api/v1/me?api_key=${secret}`, null)).body.error.code, "missing_api_key", "khoá trên URL không được chấp nhận");
    const ok = await call(me, "/api/v1/me", secret);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.data.scopes, ALL);
    assert.equal(ok.headers.get("cache-control"), "private, no-store");
    assert.ok(ok.headers.get("x-request-id"));
    assert.equal(ok.headers.get("x-ratelimit-limit"), "120");
    assert.ok(Number(ok.headers.get("x-ratelimit-remaining")) < 120);
    // chỉ lưu băm, không lưu khoá gốc
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(stored.keyHash, hashKey(secret));
    assert.ok(!JSON.stringify(stored).includes(secret));
    assert.equal(stored.keyPrefix, secret.slice(0, 8));

    await prisma.apiKey.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await call(me, "/api/v1/me", secret)).body.error.code, "key_expired");
    await prisma.apiKey.update({ where: { id: row.id }, data: { expiresAt: null } });
    await revokeApiKey(admin, row.id);
    assert.equal((await call(me, "/api/v1/me", secret)).body.error.code, "key_revoked");
    await assert.rejects(revokeApiKey(admin, row.id), /đã bị thu hồi/);
    await assert.rejects(createApiKey({ ...admin, roles: ["PRINCIPAL"] }, { name: "x y", scopes: ALL }), /Quản trị hệ thống/);
  } finally { await clean(ids); }
});

test("database: scopes gate endpoints and sensitive fields; students are paginated, filterable and minimal by default", { skip: !enabled }, async () => {
  const basic = await createApiKey(admin, { name: "T basic", scopes: ["students:read", "classes:read", "grades:read", "years:read", "teachers:read"] });
  const gradesOnly = await createApiKey(admin, { name: "T grades", scopes: ["grades:read"] });
  const contact = await createApiKey(admin, { name: "T contact", scopes: ["students:contact", "teachers:contact"] });
  const identity = await createApiKey(admin, { name: "T identity", scopes: ["students:identity"] });
  const ids = [basic.row.id, gradesOnly.row.id, contact.row.id, identity.row.id];
  try {
    const forbidden = await call(students, "/api/v1/students", gradesOnly.secret);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, "insufficient_scope");
    assert.deepEqual(forbidden.body.error.required, ["students:read"]);
    assert.equal((await call(grades, "/api/v1/grades", gradesOnly.secret)).status, 200);
    assert.equal((await call(years, "/api/v1/academic-years", gradesOnly.secret)).status, 403);

    // học sinh: danh sách cơ bản, phân trang
    const first = await call(students, "/api/v1/students?pageSize=5", basic.secret);
    assert.equal(first.status, 200);
    assert.ok(first.body.meta.total >= 5);
    assert.equal(first.body.data.length, 5);
    assert.deepEqual(first.body.meta, { page: 1, pageSize: 5, total: first.body.meta.total, totalPages: Math.ceil(first.body.meta.total / 5) });
    const s = first.body.data[0];
    assert.ok(s.id && s.fullName && s.class && s.grade && s.academicYear);
    assert.equal("contact" in s || "guardian" in s || "identity" in s || "idNumber" in s || "address" in s, false, "mặc định không lộ liên hệ/định danh");
    assert.match(s.dateOfBirth ?? "2000-01-01", /^\d{4}-\d{2}-\d{2}$/);
    const second = await call(students, "/api/v1/students?pageSize=5&page=2", basic.secret);
    assert.ok(second.body.data.every((x: { id: string }) => !first.body.data.some((y: { id: string }) => y.id === x.id)), "trang 2 không trùng trang 1");
    assert.equal((await call(students, "/api/v1/students?pageSize=500", basic.secret)).body.error.code, "invalid_parameters");
    assert.equal((await call(students, "/api/v1/students?year=1999-2000", basic.secret)).body.error.code, "year_not_found");

    // quyền liên hệ / định danh bổ sung đúng nhóm trường
    const withContact = (await call(students, "/api/v1/students?pageSize=1", contact.secret)).body.data[0];
    assert.ok("contact" in withContact && "guardian" in withContact && !("identity" in withContact));
    const withId = (await call(students, "/api/v1/students?pageSize=1", identity.secret)).body.data[0];
    assert.ok("identity" in withId && !("contact" in withId));

    // bộ lọc: lớp, khối, tìm kiếm, trạng thái
    const cls = s.class.id;
    const inClass = await call(students, `/api/v1/students?class=${cls}&pageSize=200`, basic.secret);
    assert.ok(inClass.body.data.length > 0 && inClass.body.data.every((x: { class: { id: string } }) => x.class.id === cls));
    const byGrade = await call(students, `/api/v1/students?grade=${s.grade.id}&pageSize=200`, basic.secret);
    assert.ok(byGrade.body.data.every((x: { grade: { id: string } }) => x.grade.id === s.grade.id));
    const word = s.fullName.split(" ").pop();
    const found = await call(students, `/api/v1/students?q=${encodeURIComponent(word.toUpperCase())}&pageSize=200`, basic.secret);
    assert.ok(found.body.data.some((x: { id: string }) => x.id === s.id), "tìm không phân biệt hoa thường");
    const target = await prisma.student.findUniqueOrThrow({ where: { id: s.id } });
    await prisma.user.update({ where: { id: target.userId }, data: { isActive: false } });
    try {
      assert.ok(!(await call(students, `/api/v1/students?class=${cls}&pageSize=200`, basic.secret)).body.data.some((x: { id: string }) => x.id === s.id), "mặc định bỏ học sinh bị khoá");
      const locked = await call(students, `/api/v1/students?class=${cls}&status=locked`, basic.secret);
      assert.deepEqual(locked.body.data.map((x: { id: string; status: string }) => [x.id, x.status]), [[s.id, "locked"]]);
      assert.ok((await call(students, `/api/v1/students?class=${cls}&status=all&pageSize=200`, basic.secret)).body.data.some((x: { id: string }) => x.id === s.id));
    } finally { await prisma.user.update({ where: { id: target.userId }, data: { isActive: true } }); }

    // chi tiết học sinh, lớp, học sinh trong lớp
    const one = await call(studentOne, `/api/v1/students/${s.id}`, basic.secret, { params: { id: s.id } });
    assert.equal(one.body.data.id, s.id);
    assert.equal((await call(studentOne, "/api/v1/students/khong-co", basic.secret, { params: { id: "khong-co" } })).status, 404);
    const klass = await call(classOne, `/api/v1/classes/${cls}`, basic.secret, { params: { id: cls } });
    assert.equal(klass.body.data.id, cls);
    assert.equal(klass.body.data.studentCount, (await call(students, `/api/v1/students?class=${cls}&status=all&pageSize=200`, basic.secret)).body.meta.total);
    assert.equal((await call(classOne, "/api/v1/classes/khong-co", basic.secret, { params: { id: "khong-co" } })).body.error.code, "not_found");
    const roster = await call(classStudents, `/api/v1/classes/${cls}/students`, basic.secret, { params: { id: cls } });
    assert.ok(roster.body.data.length > 0 && roster.body.data.every((x: { class: { id: string } }) => x.class.id === cls));
    const classesOnly = await createApiKey(admin, { name: "T classes", scopes: ["classes:read"] }); ids.push(classesOnly.row.id);
    assert.equal((await call(classStudents, `/api/v1/classes/${cls}/students`, classesOnly.secret, { params: { id: cls } })).status, 403, "cần cả classes:read và students:read");

    // lớp & khối
    const cl = await call(classes, "/api/v1/classes?pageSize=200", basic.secret);
    assert.ok(cl.body.data.length >= 2 && cl.body.data.every((c: { grade: unknown; academicYear: unknown }) => c.grade && c.academicYear));
    const gr = await call(grades, "/api/v1/grades", basic.secret);
    assert.ok(gr.body.data.length >= 1);
    assert.equal(gr.body.data.reduce((n: number, g: { studentCount: number }) => n + g.studentCount, 0), cl.body.data.reduce((n: number, c: { studentCount: number }) => n + c.studentCount, 0), "tổng học sinh theo khối khớp tổng theo lớp");
    const yr = await call(years, "/api/v1/academic-years", basic.secret);
    assert.equal(yr.body.data.filter((y: { current: boolean }) => y.current).length, 1);

    // giáo viên
    const tAll = await call(teachers, "/api/v1/teachers?pageSize=200", basic.secret);
    assert.ok(tAll.body.data.length >= 1);
    assert.ok(tAll.body.data.every((t: Record<string, unknown>) => !("contact" in t)));
    const homeroom = await call(teachers, "/api/v1/teachers?homeroom=true", basic.secret);
    assert.ok(homeroom.body.data.length >= 1 && homeroom.body.data.every((t: { homeroomClasses: unknown[] }) => t.homeroomClasses.length > 0));
    assert.ok((await call(teachers, "/api/v1/teachers?homeroom=false", basic.secret)).body.data.every((t: { homeroomClasses: unknown[] }) => t.homeroomClasses.length === 0));
    const tContact = await call(teachers, "/api/v1/teachers?pageSize=1", contact.secret);
    assert.ok("contact" in tContact.body.data[0]);
  } finally { await clean(ids); }
});

test("database: IP allow-list, rate limit, brute-force blocking, rotation and audit logging", { skip: !enabled }, async () => {
  const limited = await createApiKey(admin, { name: "T limited", scopes: ["grades:read"], rateLimitPerMin: 10 });
  const ipKey = await createApiKey(admin, { name: "T ip", scopes: ["grades:read"], ipAllowlist: ["203.0.113.0/24", "198.51.100.9"] });
  const ids = [limited.row.id, ipKey.row.id];
  try {
    // IP
    assert.equal((await call(me, "/api/v1/me", ipKey.secret, { ip: "203.0.113.50" })).status, 200);
    assert.equal((await call(me, "/api/v1/me", ipKey.secret, { ip: "198.51.100.9" })).status, 200);
    const blocked = await call(me, "/api/v1/me", ipKey.secret, { ip: "8.8.8.8" });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, "ip_not_allowed");

    // giới hạn tốc độ theo khoá
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await call(me, "/api/v1/me", limited.secret, { ip })).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.deepEqual(statuses.slice(10), [429, 429]);
    const over = await call(me, "/api/v1/me", limited.secret, { ip });
    assert.equal(over.body.error.code, "rate_limited");
    assert.ok(Number(over.headers.get("retry-after")) > 0);

    // dò khoá sai liên tục từ một IP → bị chặn, kể cả khi sau đó dùng khoá đúng
    const attacker = freshIp();
    for (let i = 0; i < 20; i++) await call(me, "/api/v1/me", "ek_" + "B".repeat(32), { ip: attacker });
    const afterGuess = await call(me, "/api/v1/me", ipKey.secret, { ip: attacker });
    assert.equal(afterGuess.status, 429);
    assert.equal(afterGuess.body.error.code, "too_many_failures");
    assert.equal((await call(me, "/api/v1/me", ipKey.secret, { ip: "203.0.113.60" })).status, 200, "IP khác không bị ảnh hưởng");

    // xoay khoá: khoá cũ chết, khoá mới cùng cấu hình
    const rotated = await rotateApiKey(admin, ipKey.row.id);
    ids.push(rotated.row.id);
    assert.equal((await call(me, "/api/v1/me", ipKey.secret, { ip: "203.0.113.61" })).body.error.code, "key_revoked");
    const fresh = await call(me, "/api/v1/me", rotated.secret, { ip: "203.0.113.62" });
    assert.equal(fresh.status, 200);
    assert.notEqual(rotated.secret, ipKey.secret);
    assert.deepEqual(rotated.row.ipAllowlist, ["203.0.113.0/24", "198.51.100.9"]);

    // nhật ký: có dòng cho từng yêu cầu hợp lệ, IP bị che, không lộ khoá
    const logs = await prisma.apiRequestLog.findMany({ where: { keyId: { in: ids } } });
    assert.ok(logs.length >= 12);
    assert.ok(logs.every((l) => /\.\*\.\*$/.test(l.ipMasked)), "IP chỉ lưu dạng che");
    assert.ok(logs.some((l) => l.status === 429) && logs.some((l) => l.status === 200));
    assert.ok(!JSON.stringify(logs).includes(limited.secret));
    assert.ok((await prisma.apiKey.findUniqueOrThrow({ where: { id: limited.row.id } })).lastUsedAt);
    assert.ok(await prisma.activityLog.findFirst({ where: { action: "rotate_api_key", targetId: ipKey.row.id } }));
    assert.ok(await prisma.activityLog.findFirst({ where: { action: "create_api_key", targetId: limited.row.id } }));
  } finally {
    await prisma.activityLog.deleteMany({ where: { targetType: "ApiKey" } });
    await clean(ids);
  }
});
