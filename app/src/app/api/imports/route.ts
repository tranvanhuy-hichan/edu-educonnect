import { readBoundedBody, BodyTooLargeError } from "@/lib/storage/bounded-body";
import { logger } from "@/lib/logger";
import { NextResponse, after } from "next/server";
import { observe } from "@/lib/observability/observe";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { enqueue, kick } from "@/lib/jobs/queue";
import { getMe } from "@/lib/guard";
import { uploadLimit } from "@/lib/storage/config";
import { FileAccessError } from "@/lib/storage/files";
import { createImportJob } from "@/modules/importer/importer.service";
import { ApplicationError, ConflictError, ForbiddenError } from "@/shared/errors";

export const runtime = "nodejs";
// Đọc tệp bằng AI mất vài chục giây đến vài phút; xử lý chạy sau khi đã trả phản hồi (after) trong khoảng thời gian này.
export const maxDuration = 300;

/** Tạo phiên nhập câu hỏi/đề từ tệp: lưu tệp, tạo ImportJob rồi để AI xử lý nền. Trả { id } để trang theo dõi tiến độ. */
export const POST = observe(async (request: Request) => {
  const user = await getMe();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  if (!user.teacherId) return NextResponse.json({ error: "Chỉ giáo viên được nhập tài liệu" }, { status: 403 });
  const rl = await rateLimit("import-ai", user.userId, LIMITS.importAi);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec, "Bạn vừa gửi nhiều tệp nhập liên tiếp. Vui lòng đợi vài phút rồi thử lại.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
  let limit: number;
  try { limit = uploadLimit(); } catch { return NextResponse.json({ error: "Cấu hình dung lượng tải tệp không hợp lệ" }, { status: 503 }); }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit + 65536) return NextResponse.json({ error: `Tệp không được quá ${limit / 1024 / 1024} MB` }, { status: 413 });

  let form: FormData;
  try {
    const body = await readBoundedBody(request, limit + 65536);
    form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
  } catch (error) { return NextResponse.json({ error: "Dữ liệu tải tệp không hợp lệ hoặc quá lớn" }, { status: error instanceof BodyTooLargeError ? 413 : 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Chưa chọn tệp" }, { status: 400 });
  if (file.size > limit) return NextResponse.json({ error: `Tệp không được quá ${limit / 1024 / 1024} MB` }, { status: 413 });
  const field = (k: string) => String(form.get(k) ?? "").trim();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const job = await createImportJob(user, {
      kind: field("kind"), subjectId: field("subjectId"), gradeLevelId: field("gradeLevelId"), libraryLessonId: field("libraryLessonId") || null,
      fileName: file.name.replace(/[\\/]/g, "_").slice(-180), buffer,
    });
    // Việc được ghi vào hàng đợi bền vững (có thử lại, có theo dõi ở /van-hanh); after() chỉ để chạy ngay, cron là lưới an toàn.
    await enqueue("import.run", { importJobId: job.id, userId: user.userId }, { dedupeKey: `import:${job.id}`, maxAttempts: 2, createdBy: user.userId });
    after(() => kick());
    return NextResponse.json({ id: job.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ForbiddenError || error instanceof FileAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof ApplicationError) return NextResponse.json({ error: error.message }, { status: error.status });
    logger.error({ err: error }, "imports_create_failed");
    return NextResponse.json({ error: "Không thể tạo phiên nhập. Vui lòng kiểm tra cấu hình kho lưu trữ hoặc thử lại." }, { status: 503 });
  }
});
