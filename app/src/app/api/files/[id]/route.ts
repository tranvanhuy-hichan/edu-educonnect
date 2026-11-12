import { NextResponse } from "next/server";
import { observe } from "@/lib/observability/observe";
import { logger } from "@/lib/logger";
import { getMe } from "@/lib/guard";
import { downloadFile } from "@/modules/files/files.service";
import { ApplicationError } from "@/shared/errors";
export const runtime = "nodejs";
export const GET = observe(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getMe();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  const { id } = await params;
  try {
    const url = await downloadFile(user, id);
    return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    if (!(error instanceof ApplicationError)) logger.error({ err: error, fileId: id }, "file_download_failed");
    return NextResponse.json({ error: error instanceof ApplicationError ? error.message : "Chưa kết nối được kho lưu trữ của tệp" }, { status: error instanceof ApplicationError ? error.status : 503 });
  }
});
