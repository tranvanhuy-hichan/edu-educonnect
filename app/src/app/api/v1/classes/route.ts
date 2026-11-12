import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";
import { createClass } from "@/modules/public-api/write/class-write";
import { classCreate } from "@/modules/public-api/write/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["classes:read"], async ({ url }) => svc.classes(url.searchParams));

/** Tạo lớp (cần phòng học cố định và ít nhất một môn). Cùng quy tắc như tạo lớp trong giao diện quản trị. Cần header Idempotency-Key. */
export const POST = publicApi(["classes:write"], async ({ json, auth }) => {
  const id = await createClass(auth.key, json(classCreate));
  return { status: 201, data: await svc.classById(id) };
}, { idempotent: true });
