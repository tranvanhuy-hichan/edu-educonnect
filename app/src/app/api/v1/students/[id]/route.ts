import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";
import { updateStudent } from "@/modules/public-api/write/student-write";
import { studentPatch } from "@/modules/public-api/write/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["students:read"], async ({ url, params, auth }) => ({ data: await svc.studentById(params.id, url.searchParams, auth.scopes) }));

/** Cập nhật một phần hồ sơ học sinh. Chỉ các trường gửi lên được đổi; null xoá giá trị. */
export const PATCH = publicApi(["students:write"], async ({ json, params, auth }) => {
  const r = await updateStudent(auth.key, auth.scopes, params.id, json(studentPatch));
  return { data: await svc.studentById(params.id, new URLSearchParams(), auth.scopes), meta: { changed: r.changed } };
});
