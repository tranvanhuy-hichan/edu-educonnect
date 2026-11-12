import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";
import { updateTeacher } from "@/modules/public-api/write/teacher-write";
import { teacherPatch } from "@/modules/public-api/write/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["teachers:read"], async ({ url, params, auth }) => ({ data: await svc.teacherById(params.id, url.searchParams, auth.scopes) }));

export const PATCH = publicApi(["teachers:write"], async ({ json, params, auth }) => {
  const r = await updateTeacher(auth.key, auth.scopes, params.id, json(teacherPatch));
  return { data: await svc.teacherById(params.id, new URLSearchParams(), auth.scopes), meta: { changed: r.changed } };
});
