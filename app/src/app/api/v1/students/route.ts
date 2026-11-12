import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";
import { createStudent } from "@/modules/public-api/write/student-write";
import { studentCreate } from "@/modules/public-api/write/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["students:read"], async ({ url, auth }) => svc.students(url.searchParams, auth.scopes));

/** Tạo học sinh (kèm tài khoản đăng nhập, mật khẩu ngẫu nhiên bắt đổi lần đầu). Cần header Idempotency-Key. */
export const POST = publicApi(["students:write"], async ({ json, auth }) => {
  const id = await createStudent(auth.key, auth.scopes, json(studentCreate));
  return { status: 201, data: await svc.studentById(id, new URLSearchParams(), auth.scopes) };
}, { idempotent: true });
