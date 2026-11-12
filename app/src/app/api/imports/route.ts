import { NextResponse, after } from "next/server";
import { getMe } from "@/lib/guard";
import { uploadLimit } from "@/lib/storage/config";
import { FileAccessError } from "@/lib/storage/files";
import { createImportJob, runImportJob } from "@/modules/importer/importer.service";
import { ApplicationError, ConflictError, ForbiddenError } from "@/shared/errors";

export const runtime = "nodejs";
// Đọc tệp bằng AI mất vài chục giây đến vài phút; xử lý chạy sau khi đã trả phản hồi (after) trong khoảng thời gian này.
export const maxDuration = 300;

/** Tạo phiên nhập câu hỏi/đề từ tệp: lưu tệp, tạo ImportJob rồi để AI xử lý nền. Trả { id } để trang theo dõi tiến độ. */
export async function POST(request: Request) {
  const user = await getMe();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
  let limit: number;
  try { limit = uploadLimit(); } catch { return NextResponse.json({ error: "Cấu hình dung lượng tải tệp không hợp lệ" }, { status: 503 }); }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit + 65536) return NextResponse.json({ error: `Tệp không được quá ${limit / 1024 / 1024} MB` }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Dữ liệu tải tệp không hợp lệ" }, { status: 400 }); }
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
    after(() => runImportJob(user, job.id, buffer));
    return NextResponse.json({ id: job.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ForbiddenError || error instanceof FileAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof ApplicationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[imports] create failed", error);
    return NextResponse.json({ error: "Không thể tạo phiên nhập. Vui lòng kiểm tra cấu hình kho lưu trữ hoặc thử lại." }, { status: 503 });
  }
}
