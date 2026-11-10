import { NextResponse } from "next/server";
import { getMe } from "@/lib/guard";
import { uploadLimit } from "@/lib/storage/config";
import { validateUpload } from "@/lib/storage/validation";
import { requireUploadAccess, FileAccessError } from "@/lib/storage/files";
import { uploadFile } from "@/modules/files/files.service";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getMe();
  if (!user) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 403 });
  let limit: number;
  try { limit = uploadLimit(); } catch { return NextResponse.json({ error: "Cấu hình dung lượng tải tệp không hợp lệ" }, { status: 503 }); }
  // Giới hạn trước khi phân tích multipart, kể cả request truyền chunked.
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Chưa chọn tệp" }, { status: 400 });
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > limit + 65536) { await reader.cancel(); return NextResponse.json({ error: `Tệp không được quá ${limit / 1024 / 1024} MB` }, { status: 413 }); }
    chunks.push(value);
  }
  let form: FormData;
  try { form = await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(); }
  catch { return NextResponse.json({ error: "Dữ liệu tải tệp không hợp lệ" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Chưa chọn tệp" }, { status: 400 });
  try { validateUpload(file.name, file.size, limit); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const assignmentId = String(form.get("assignmentId") || ""), purpose = String(form.get("purpose") || ""), exerciseId = String(form.get("exerciseId") || "") || null;
  if (!assignmentId || assignmentId.length > 100 || (exerciseId?.length ?? 0) > 100) return NextResponse.json({ error: "Chọn lớp-môn hợp lệ trước khi tải tệp" }, { status: 400 });
  try { await requireUploadAccess(user, assignmentId, purpose, exerciseId); } catch (error) { return NextResponse.json({ error: error instanceof FileAccessError ? error.message : "Không tìm thấy lớp-môn" }, { status: 403 }); }
  try {
    const saved = await uploadFile(user, { assignmentId, purpose, exerciseId, name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json(saved, { status: 201 });
  } catch { return NextResponse.json({ error: "Không thể lưu tệp. Vui lòng kiểm tra cấu hình kho lưu trữ hoặc thử lại." }, { status: 503 }); }
}
