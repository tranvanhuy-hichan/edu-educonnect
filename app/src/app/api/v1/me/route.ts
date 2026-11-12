import { publicApi } from "@/lib/public-api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kiểm tra kết nối: cho biết khoá đang dùng có những quyền nào và giới hạn tốc độ bao nhiêu. Không cần quyền dữ liệu nào. */
export const GET = publicApi([], async ({ auth }) => ({
  data: { name: auth.key.name, scopes: [...auth.scopes], rateLimitPerMin: auth.key.rateLimitPerMin, expiresAt: auth.key.expiresAt?.toISOString() ?? null },
}));
