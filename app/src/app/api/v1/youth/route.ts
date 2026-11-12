import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thông tin Đoàn của các học sinh đã có dữ liệu Đoàn (chỉ mã học sinh + thông tin Đoàn). */
export const GET = publicApi(["youth:read"], async ({ url }) => svc.youthList(url.searchParams));
