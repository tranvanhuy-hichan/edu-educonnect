import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";
import { updateClass } from "@/modules/public-api/write/class-write";
import { classPatch } from "@/modules/public-api/write/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["classes:read"], async ({ params }) => ({ data: await svc.classById(params.id) }));

export const PATCH = publicApi(["classes:write"], async ({ json, params, auth }) => {
  const r = await updateClass(auth.key, params.id, json(classPatch));
  return { data: await svc.classById(params.id), meta: { changed: r.changed } };
});
