import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = publicApi(["catalog:read"], async () => ({ data: await svc.subjects() }));
