import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";
import { createTeacher } from "@/modules/public-api/write/teacher-write";
import { teacherCreate } from "@/modules/public-api/write/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["teachers:read"], async ({ url, auth }) => svc.teachers(url.searchParams, auth.scopes));

/** Tạo hồ sơ giáo viên kèm tài khoản (mật khẩu ngẫu nhiên, bắt đổi lần đầu; quản trị cấp lại mật khẩu ở mục Tài khoản). Cần header Idempotency-Key. */
export const POST = publicApi(["teachers:write"], async ({ json, auth }) => {
  const id = await createTeacher(auth.key, auth.scopes, json(teacherCreate));
  return { status: 201, data: await svc.teacherById(id, new URLSearchParams(), auth.scopes) };
}, { idempotent: true });
