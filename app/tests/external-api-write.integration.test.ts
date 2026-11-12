import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { createApiKey } from "../src/modules/apikeys/api-key.service";
import { revertApiChange } from "../src/modules/public-api/write/revert";
import { GET as studentsGet, POST as studentsPost } from "../src/app/api/v1/students/route";
import { PATCH as studentPatch } from "../src/app/api/v1/students/[id]/route";
import { PUT as studentClass } from "../src/app/api/v1/students/[id]/class/route";
import { GET as youthGet, PATCH as youthPatch } from "../src/app/api/v1/students/[id]/youth/route";
import { GET as youthList } from "../src/app/api/v1/youth/route";
import { POST as teachersPost } from "../src/app/api/v1/teachers/route";
import { PATCH as teacherPatch } from "../src/app/api/v1/teachers/[id]/route";
import { POST as classesPost } from "../src/app/api/v1/classes/route";
import { PATCH as classPatch } from "../src/app/api/v1/classes/[id]/route";
import { GET as roomsGet } from "../src/app/api/v1/rooms/route";
import { GET as subjectsGet } from "../src/app/api/v1/subjects/route";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
after(async () => { await prisma.$disconnect(); });

const admin = { userId: "t-admin", email: "t-admin@test.invalid", roles: ["ADMIN" as const], teacherId: null, studentId: null };
const FULL = ["students:write", "students:contact", "students:identity", "teachers:write", "teachers:contact", "classes:write", "youth:write", "youth:read"];
let n = 0; const ip = () => `203.0.113.${(++n % 240) + 1}`;
const tag = `zw${Date.now().toString(36)}`;
type H = (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const send = async (h: H, method: string, path: string, key: string, opts: { body?: unknown; raw?: string; idem?: string | null; params?: Record<string, string>; type?: string | null } = {}) => {
  const headers: Record<string, string> = { "x-real-ip": ip(), authorization: `Bearer ${key}` };
  if (opts.type !== null) headers["content-type"] = opts.type ?? "application/json";
  if (opts.idem !== null && opts.idem !== undefined) headers["idempotency-key"] = opts.idem;
  const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  const res = await h(new Request(`http://localhost${path}`, { method, headers, body }), opts.params ? { params: Promise.resolve(opts.params) } : undefined);
  return { status: res.status, headers: res.headers, body: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const idem = () => `${tag}-${Math.random().toString(36).slice(2, 12)}`;

async function cleanup() {
  const students = await prisma.student.findMany({ where: { fullName: { startsWith: `ZW ${tag}` } }, select: { id: true, userId: true } });
  const sid = students.map((s) => s.id);
  await prisma.classTransfer.deleteMany({ where: { studentId: { in: sid } } });
  await prisma.studentClassEnrollment.deleteMany({ where: { studentId: { in: sid } } });
  await prisma.studentYouth.deleteMany({ where: { studentId: { in: sid } } });
  await prisma.student.deleteMany({ where: { id: { in: sid } } });
  await prisma.user.deleteMany({ where: { id: { in: students.map((s) => s.userId) } } });
  const teachers = await prisma.teacher.findMany({ where: { fullName: { startsWith: `ZW ${tag}` } }, select: { id: true, userId: true } });
  await prisma.schoolClass.updateMany({ where: { homeroomTeacherId: { in: teachers.map((t) => t.id) } }, data: { homeroomTeacherId: null } });
  await prisma.teacher.deleteMany({ where: { id: { in: teachers.map((t) => t.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: teachers.map((t) => t.userId) } } });
  const classes = await prisma.schoolClass.findMany({ where: { className: { startsWith: `ZW${tag}` } }, select: { id: true } });
  await prisma.classSubject.deleteMany({ where: { schoolClassId: { in: classes.map((c) => c.id) } } });
  await prisma.schoolClass.deleteMany({ where: { id: { in: classes.map((c) => c.id) } } });
  await prisma.trashItem.deleteMany({ where: { OR: [{ label: { contains: tag } }] } });
  await prisma.activityLog.deleteMany({ where: { OR: [{ actorEmail: { startsWith: "api:ZW" } }, { actorEmail: "t-admin@test.invalid" }] } });
  await prisma.apiKey.deleteMany({ where: { name: { startsWith: `ZW ${tag}` } } });
  await prisma.$executeRaw`DELETE FROM "LoginThrottle"`;
}

test("database: creating a student is validated, idempotent, scoped per field group, logged and reversible", { skip: !enabled }, async () => {
  const full = await createApiKey(admin, { name: `ZW ${tag} full`, scopes: FULL });
  const basic = await createApiKey(admin, { name: `ZW ${tag} basic`, scopes: ["students:write"] });
  const readOnly = await createApiKey(admin, { name: `ZW ${tag} ro`, scopes: ["students:read"] });
  const cls = await prisma.schoolClass.findFirstOrThrow({ where: { enrollments: { some: {} } } });
  const body = { fullName: `ZW ${tag} Nguyễn A`, dateOfBirth: "2010-05-14", gender: "MALE", classId: cls.id, contact: { phone: "0912 345 678", email: "a@example.com", address: "Quảng Ngãi" }, guardian: { name: "Nguyễn B", relation: "Bố", phone: "0987654321" }, identity: { idNumber: "051234567890", ethnicity: "Kinh" } };
  try {
    // đọc-chỉ không ghi được; thiếu Idempotency-Key; sai kiểu nội dung; JSON hỏng; trường lạ; dữ liệu sai
    assert.equal((await send(studentsPost, "POST", "/api/v1/students", readOnly.secret, { body, idem: idem() })).status, 403);
    assert.equal((await send(studentsPost, "POST", "/api/v1/students", full.secret, { body })).body.error.code, "idempotency_key_required");
    assert.equal((await send(studentsPost, "POST", "/api/v1/students", full.secret, { body, idem: idem(), type: "text/plain" })).status, 415);
    assert.equal((await send(studentsPost, "POST", "/api/v1/students", full.secret, { raw: "{khong phai json", idem: idem() })).body.error.code, "invalid_json");
    const unknown = await send(studentsPost, "POST", "/api/v1/students", full.secret, { body: { ...body, isAdmin: true }, idem: idem() });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, "invalid_parameters");
    for (const bad of [{ dateOfBirth: "2010-02-30" }, { contact: { phone: "abc" } }, { identity: { idNumber: "12" } }, { gender: "X" }, { fullName: "" }]) assert.equal((await send(studentsPost, "POST", "/api/v1/students", full.secret, { body: { ...body, ...bad }, idem: idem() })).status, 400, JSON.stringify(bad));
    assert.equal((await send(studentsPost, "POST", "/api/v1/students", full.secret, { raw: JSON.stringify({ fullName: "x".repeat(70_000) }), idem: idem() })).status, 413);
    assert.equal(await prisma.student.count({ where: { fullName: { startsWith: `ZW ${tag}` } } }), 0, "dữ liệu sai không tạo gì");

    // quyền theo nhóm trường: thiếu students:contact/identity thì từ chối cả yêu cầu
    const scoped = await send(studentsPost, "POST", "/api/v1/students", basic.secret, { body, idem: idem() });
    assert.equal(scoped.status, 403);
    assert.deepEqual(scoped.body.error.required.sort(), ["students:contact", "students:identity"]);
    assert.equal(await prisma.student.count({ where: { fullName: { startsWith: `ZW ${tag}` } } }), 0);

    // tạo thành công + chống gửi trùng
    const key = idem();
    const created = await send(studentsPost, "POST", "/api/v1/students", full.secret, { body, idem: key });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const dto = created.body.data;
    assert.match(dto.code, /^HS\d{8}$/);
    assert.equal(dto.class.id, cls.id);
    assert.equal(dto.dateOfBirth, "2010-05-14");
    assert.equal(dto.contact.phone, "0912 345 678");
    assert.equal(dto.guardian.name, "Nguyễn B");
    assert.equal(dto.identity.idNumber, "051234567890");
    assert.ok(!JSON.stringify(created.body).toLowerCase().includes("password"), "không trả mật khẩu");
    const user = await prisma.user.findFirstOrThrow({ where: { student: { id: dto.id } } });
    assert.deepEqual([user.roles, user.mustChangePwd], [["STUDENT"], true]);
    const replay = await send(studentsPost, "POST", "/api/v1/students", full.secret, { body, idem: key });
    assert.equal(replay.status, 201);
    assert.equal(replay.headers.get("idempotent-replay"), "true");
    assert.equal(replay.body.data.id, dto.id);
    assert.equal(await prisma.student.count({ where: { fullName: body.fullName } }), 1, "gửi lại không tạo trùng");
    assert.equal((await send(studentsPost, "POST", "/api/v1/students", full.secret, { body: { ...body, fullName: `ZW ${tag} Khác` }, idem: key })).body.error.code, "idempotency_key_reuse");
    // lỗi thì nhả khoá: sửa nội dung rồi gửi lại cùng khoá được
    const badKey = idem();
    assert.equal((await send(studentsPost, "POST", "/api/v1/students", full.secret, { body: { fullName: "" }, idem: badKey })).status, 400);
    assert.equal((await send(studentsPost, "POST", "/api/v1/students", full.secret, { body: { fullName: `ZW ${tag} Sau khi sửa` }, idem: badKey })).status, 201);
    assert.equal((await send(studentsPost, "POST", "/api/v1/students", full.secret, { body: { fullName: `ZW ${tag} Lớp lạ`, classId: "khong-co" }, idem: idem() })).body.error.code, "class_not_found");
    assert.equal(await prisma.student.count({ where: { fullName: `ZW ${tag} Lớp lạ` } }), 0, "lỗi xếp lớp không để lại học sinh dở");

    // nhật ký + hoàn tác việc tạo
    const change = await prisma.apiChange.findFirstOrThrow({ where: { entityId: dto.id, kind: "STUDENT_CREATE" } });
    assert.ok(await prisma.activityLog.findFirst({ where: { action: "api_create_student", targetId: dto.id, actorEmail: `api:ZW ${tag} full` } }));
    await revertApiChange(admin, change.id);
    assert.equal(await prisma.student.count({ where: { id: dto.id } }), 0);
    assert.ok(await prisma.trashItem.findFirst({ where: { kind: "STUDENT", label: body.fullName } }), "vào Thùng rác, khôi phục được");
    await assert.rejects(revertApiChange(admin, change.id), /đã được hoàn tác/);
    await assert.rejects(revertApiChange({ ...admin, roles: ["PRINCIPAL"] }, change.id), /Quản trị hệ thống/);
  } finally { await cleanup(); }
});

test("database: patching a student changes only what was sent, ignores no-ops, refuses unsafe reverts and moves classes with the school's rules", { skip: !enabled }, async () => {
  const full = await createApiKey(admin, { name: `ZW ${tag} p`, scopes: FULL });
  const enrol = await prisma.studentClassEnrollment.findFirstOrThrow({ where: { student: { yearEndResults: { none: { reviewStatus: "APPROVED" } } } }, include: { schoolClass: true } });
  const other = await prisma.schoolClass.findFirstOrThrow({ where: { academicYearId: enrol.academicYearId, id: { not: enrol.schoolClassId } } });
  const made = await send(studentsPost, "POST", "/api/v1/students", full.secret, { body: { fullName: `ZW ${tag} Patch`, classId: enrol.schoolClassId }, idem: idem() });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.data.id;
  const patch = (b: unknown) => send(studentPatch, "PATCH", `/api/v1/students/${id}`, full.secret, { body: b, params: { id } });
  try {
    const r = await patch({ fullName: `ZW ${tag} Patch Moi`, gender: "FEMALE", contact: { phone: "0911111111" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.meta.changed, true);
    assert.equal(r.body.data.fullName, `ZW ${tag} Patch Moi`);
    assert.equal((await prisma.student.findUniqueOrThrow({ where: { id } })).phone, "0911111111");
    const change = await prisma.apiChange.findFirstOrThrow({ where: { entityId: id, kind: "STUDENT_UPDATE" } });
    assert.deepEqual(change.after, { fullName: `ZW ${tag} Patch Moi`, gender: "FEMALE", phone: "0911111111" });
    assert.deepEqual(change.before, { fullName: `ZW ${tag} Patch`, gender: null, phone: null });
    // gửi lại y nguyên: không đổi, không thêm nhật ký
    const again = await patch({ fullName: `ZW ${tag} Patch Moi`, contact: { phone: "0911111111" } });
    assert.equal(again.body.meta.changed, false);
    assert.equal(await prisma.apiChange.count({ where: { entityId: id, kind: "STUDENT_UPDATE" } }), 1);
    assert.equal((await patch({})).status, 400, "không gửi trường nào là lỗi");
    assert.equal((await patch({ dateOfBirth: null })).status, 200, "null xoá giá trị");
    assert.equal((await send(studentPatch, "PATCH", "/api/v1/students/khong-co", full.secret, { body: { fullName: "x y" }, params: { id: "khong-co" } })).status, 404);
    // hoàn tác an toàn: bị sửa tiếp thì từ chối
    await patch({ fullName: `ZW ${tag} Patch Lan 2` });
    await assert.rejects(revertApiChange(admin, change.id), /đã được sửa sau đó \(fullName\)/);
    const second = await prisma.apiChange.findFirstOrThrow({ where: { entityId: id, kind: "STUDENT_UPDATE", revertedAt: null }, orderBy: { createdAt: "desc" } });
    await revertApiChange(admin, second.id);
    assert.equal((await prisma.student.findUniqueOrThrow({ where: { id } })).fullName, `ZW ${tag} Patch Moi`);
    await revertApiChange(admin, change.id); // giờ đã đúng thứ tự: hoàn tác được
    const back = await prisma.student.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([back.fullName, back.gender, back.phone], [`ZW ${tag} Patch`, null, null]);

    // chuyển lớp theo quy tắc của trường
    const today = new Date().toISOString().slice(0, 10);
    const put = (b: unknown) => send(studentClass, "PUT", `/api/v1/students/${id}/class`, full.secret, { body: b, params: { id } });
    assert.equal((await put({ classId: other.id, effectiveDate: today, reason: "ngắn", decisionReference: "QĐ-1" })).status, 400, "lý do quá ngắn");
    assert.equal((await put({ classId: enrol.schoolClassId, effectiveDate: today, reason: "Chuyển thử qua API", decisionReference: "QĐ-1" })).body.error.code, "business_rule", "đang ở lớp này");
    assert.equal((await put({ classId: "khong-co", effectiveDate: today, reason: "Chuyển thử qua API", decisionReference: "QĐ-1" })).body.error.code, "class_not_found");
    const moved = await put({ classId: other.id, effectiveDate: today, reason: "Chuyển thử qua API", decisionReference: "QĐ-TEST-1" });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.data.class.id, other.id);
    assert.equal(await prisma.classTransfer.count({ where: { studentId: id } }), 1, "lịch sử chuyển lớp được ghi");
    const moveChange = await prisma.apiChange.findFirstOrThrow({ where: { entityId: id, kind: "STUDENT_CLASS" } });
    await revertApiChange(admin, moveChange.id);
    assert.equal((await prisma.studentClassEnrollment.findFirstOrThrow({ where: { studentId: id, academicYearId: enrol.academicYearId } })).schoolClassId, enrol.schoolClassId);
    assert.equal(await prisma.classTransfer.count({ where: { studentId: id } }), 2, "hoàn tác cũng để lại lịch sử, không xoá dấu vết");
  } finally { await cleanup(); }
});

test("database: youth data is isolated (youth-only keys never see the student record) and every change can be undone", { skip: !enabled }, async () => {
  const full = await createApiKey(admin, { name: `ZW ${tag} y`, scopes: ["students:write", "youth:write"] });
  const youthOnly = await createApiKey(admin, { name: `ZW ${tag} yo`, scopes: ["youth:write"] });
  const noYouth = await createApiKey(admin, { name: `ZW ${tag} ny`, scopes: ["students:read"] });
  const made = await send(studentsPost, "POST", "/api/v1/students", full.secret, { body: { fullName: `ZW ${tag} Doan` }, idem: idem() });
  const id = made.body.data.id;
  try {
    assert.equal(made.body.data.youth.isMember, false, "có quyền youth:read thì DTO học sinh có khối youth");
    const p = (b: unknown, k = youthOnly.secret) => send(youthPatch, "PATCH", `/api/v1/students/${id}/youth`, k, { body: b, params: { id } });
    const set = await p({ isMember: true, joinedAt: "2025-03-26", branch: "Chi đoàn 10A1", position: "Bí thư" });
    assert.equal(set.status, 200);
    assert.deepEqual(Object.keys(set.body.data).sort(), ["branch", "isMember", "joinedAt", "note", "position", "studentId", "updatedAt"], "khoá chỉ có quyền Đoàn không thấy hồ sơ học sinh");
    assert.ok(!JSON.stringify(set.body).includes("ZW "), "không lộ họ tên học sinh");
    assert.equal(set.body.data.joinedAt, "2025-03-26");
    assert.equal((await p({ isMember: true }, noYouth.secret)).status, 403);
    assert.equal((await p({ isMember: true })).body.meta.changed, false);
    assert.equal((await p({ joinedAt: "2025-13-40" })).status, 400);
    assert.equal((await send(youthGet, "GET", `/api/v1/students/${id}/youth`, youthOnly.secret, { params: { id }, type: null })).status, 200, "quyền ghi Đoàn kéo theo quyền đọc Đoàn");
    assert.equal((await send(studentsGet, "GET", `/api/v1/students?pageSize=1`, youthOnly.secret, { type: null })).status, 403, "nhưng không kéo theo quyền đọc hồ sơ học sinh");
    const reader = await createApiKey(admin, { name: `ZW ${tag} yr`, scopes: ["youth:read"] });
    const got = await send(youthGet, "GET", `/api/v1/students/${id}/youth`, reader.secret, { params: { id }, type: null });
    assert.equal(got.body.data.branch, "Chi đoàn 10A1");
    const list = await send(youthList, "GET", "/api/v1/youth?pageSize=200", reader.secret, { type: null });
    assert.ok(list.body.data.some((x: { studentId: string; isMember: boolean }) => x.studentId === id && x.isMember));
    // hoàn tác: lần đầu tạo bản ghi Đoàn → hoàn tác xoá bản ghi; lần sửa → trở về giá trị trước
    await p({ position: "Phó bí thư" });
    const [first, second] = (await prisma.apiChange.findMany({ where: { entityId: id, kind: "YOUTH_UPDATE" }, orderBy: { createdAt: "asc" } }));
    await assert.rejects(revertApiChange(admin, first.id), /đã được sửa sau đó/);
    await revertApiChange(admin, second.id);
    assert.equal((await prisma.studentYouth.findUniqueOrThrow({ where: { studentId: id } })).position, "Bí thư");
    await revertApiChange(admin, first.id);
    assert.equal(await prisma.studentYouth.count({ where: { studentId: id } }), 0);
  } finally { await cleanup(); }
});

test("database: teachers and classes follow the school's own rules; creations are reversible only while unused", { skip: !enabled }, async () => {
  const full = await createApiKey(admin, { name: `ZW ${tag} tc`, scopes: FULL });
  const noContact = await createApiKey(admin, { name: `ZW ${tag} nc`, scopes: ["teachers:write", "classes:write"] });
  const cat = await createApiKey(admin, { name: `ZW ${tag} cat`, scopes: ["catalog:read"] });
  const subjects = (await send(subjectsGet, "GET", "/api/v1/subjects", cat.secret, { type: null })).body.data;
  const rooms = (await send(roomsGet, "GET", "/api/v1/rooms", cat.secret, { type: null })).body.data;
  assert.ok(subjects.length >= 2 && rooms.length >= 1);
  const grade = await prisma.gradeLevel.findFirstOrThrow();
  const email = `${tag}@test.invalid`;
  try {
    // giáo viên
    const tBody = { fullName: `ZW ${tag} Thầy`, loginEmail: email, gender: "MALE", subjectIds: [subjects[0].id], contact: { phone: "0909000111" } };
    assert.equal((await send(teachersPost, "POST", "/api/v1/teachers", noContact.secret, { body: tBody, idem: idem() })).body.error.required[0], "teachers:contact");
    assert.equal((await send(teachersPost, "POST", "/api/v1/teachers", full.secret, { body: { ...tBody, subjectIds: ["khong-co"] }, idem: idem() })).body.error.code, "subject_not_found");
    const t = await send(teachersPost, "POST", "/api/v1/teachers", full.secret, { body: tBody, idem: idem() });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    const tid = t.body.data.id;
    assert.deepEqual(t.body.data.subjects.map((s: { id: string }) => s.id), [subjects[0].id]);
    assert.equal(t.body.data.contact.phone, "0909000111");
    const tUser = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.deepEqual([tUser.roles, tUser.mustChangePwd], [["SUBJECT_TEACHER"], true]);
    assert.equal((await send(teachersPost, "POST", "/api/v1/teachers", full.secret, { body: { ...tBody, fullName: `ZW ${tag} Trùng` }, idem: idem() })).body.error.code, "email_taken");
    const tp = await send(teacherPatch, "PATCH", `/api/v1/teachers/${tid}`, full.secret, { body: { degree: "Thạc sĩ", subjectIds: [subjects[1].id] }, params: { id: tid } });
    assert.deepEqual(tp.body.data.subjects.map((s: { id: string }) => s.id), [subjects[1].id], "subjectIds thay thế toàn bộ");
    const tChange = await prisma.apiChange.findFirstOrThrow({ where: { entityId: tid, kind: "TEACHER_UPDATE" } });
    await revertApiChange(admin, tChange.id);
    assert.deepEqual((await prisma.teacherSubject.findMany({ where: { teacherId: tid } })).map((s) => s.subjectId), [subjects[0].id]);

    // lớp
    const cBody = { name: `ZW${tag}A`, gradeId: grade.id, roomId: rooms[0].id, shift: "MORNING", homeroomTeacherId: tid, subjectIds: [subjects[0].id, subjects[1].id] };
    assert.equal((await send(classesPost, "POST", "/api/v1/classes", full.secret, { body: { ...cBody, subjectIds: [] }, idem: idem() })).status, 400, "cần ít nhất một môn");
    assert.equal((await send(classesPost, "POST", "/api/v1/classes", full.secret, { body: { ...cBody, gradeId: "khong-co" }, idem: idem() })).body.error.code, "grade_not_found");
    assert.equal((await send(classesPost, "POST", "/api/v1/classes", full.secret, { body: { ...cBody, homeroomTeacherId: "khong-co" }, idem: idem() })).body.error.code, "teacher_not_found");
    const c = await send(classesPost, "POST", "/api/v1/classes", full.secret, { body: cBody, idem: idem() });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const cid = c.body.data.id;
    assert.equal(c.body.data.homeroomTeacher.id, tid);
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { email } })).roles.includes("HOMEROOM_TEACHER"), "được giao chủ nhiệm thì có thêm vai trò GVCN");
    assert.equal((await prisma.classSubject.count({ where: { schoolClassId: cid } })), 2);
    // quy tắc của trường: trùng tên, trùng phòng cùng ca
    assert.equal((await send(classesPost, "POST", "/api/v1/classes", full.secret, { body: cBody, idem: idem() })).body.error.code, "business_rule");
    const clash = await send(classesPost, "POST", "/api/v1/classes", full.secret, { body: { ...cBody, name: `ZW${tag}B` }, idem: idem() });
    assert.equal(clash.status, 409);
    assert.match(clash.body.error.message, /không thể có 2 lớp học chung 1 phòng/);
    const cp = await send(classPatch, "PATCH", `/api/v1/classes/${cid}`, full.secret, { body: { name: `ZW${tag}C`, homeroomTeacherId: null }, params: { id: cid } });
    assert.equal(cp.body.data.name, `ZW${tag}C`);
    assert.equal(cp.body.data.homeroomTeacher, null);
    assert.equal((await send(classPatch, "PATCH", `/api/v1/classes/${cid}`, full.secret, { body: {}, params: { id: cid } })).status, 400);

    // hoàn tác việc tạo: lớp đang có học sinh thì không; lớp trống thì vào Thùng rác
    const stu = await send(studentsPost, "POST", "/api/v1/students", full.secret, { body: { fullName: `ZW ${tag} Trong lop`, classId: cid }, idem: idem() });
    assert.equal(stu.status, 201, JSON.stringify(stu.body));
    const cCreate = await prisma.apiChange.findFirstOrThrow({ where: { entityId: cid, kind: "CLASS_CREATE" } });
    await assert.rejects(revertApiChange(admin, cCreate.id), /đã có học sinh/);
    await prisma.studentClassEnrollment.deleteMany({ where: { schoolClassId: cid } });
    const cUpdate = await prisma.apiChange.findFirstOrThrow({ where: { entityId: cid, kind: "CLASS_UPDATE" } });
    await revertApiChange(admin, cUpdate.id);
    assert.equal((await prisma.schoolClass.findUniqueOrThrow({ where: { id: cid } })).className, `ZW${tag}A`);
    await revertApiChange(admin, cCreate.id);
    assert.equal(await prisma.schoolClass.count({ where: { id: cid } }), 0);
    assert.ok(await prisma.trashItem.findFirst({ where: { kind: "CLASS", label: `Lớp ZW${tag}A` } }));

    // giáo viên: đã có phân công thì không hoàn tác việc tạo; chưa có thì xoá
    const tCreate = await prisma.apiChange.findFirstOrThrow({ where: { entityId: tid, kind: "TEACHER_CREATE" } });
    await revertApiChange(admin, tCreate.id);
    assert.equal(await prisma.teacher.count({ where: { id: tid } }), 0);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  } finally { await cleanup(); }
});
