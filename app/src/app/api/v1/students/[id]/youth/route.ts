import { publicApi } from "@/lib/public-api/handler";
import { youthOf } from "@/modules/public-api/public-api.service";
import { setYouth } from "@/modules/public-api/write/student-write";
import { youthPatch } from "@/modules/public-api/write/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["youth:read"], async ({ params }) => ({ data: await youthOf(params.id) }));

/** Cập nhật thông tin Đoàn của học sinh. Chỉ trả thông tin Đoàn (không trả hồ sơ học sinh) để khoá chỉ có quyền Đoàn không đọc được dữ liệu khác. */
export const PATCH = publicApi(["youth:write"], async ({ json, params, auth }) => {
  const r = await setYouth(auth.key, params.id, json(youthPatch));
  return { data: await youthOf(params.id), meta: { changed: r.changed } };
});
