import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["grades:read"], async ({ url }) => {
  const { year, data } = await svc.grades(url.searchParams);
  return { data, meta: { academicYear: { id: year.id, name: year.yearName } } };
});
