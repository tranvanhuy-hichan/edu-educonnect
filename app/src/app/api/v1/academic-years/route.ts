import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["years:read"], async () => ({ data: await svc.years() }));
