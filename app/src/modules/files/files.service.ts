import type { SessionUser } from "@/lib/auth/session";
import { ApplicationError } from "@/shared/errors";
import { storageProvider, uploadLimit } from "@/lib/storage/config";
import { validateUpload, FILE_PATH } from "@/lib/storage/validation";
import { uploadObject, removeObject, objectDownloadUrl } from "@/lib/storage/adapters";
import { requireUploadAccess, canDownloadFile } from "./files.policy";
import * as repository from "./files.repository";

export async function uploadFile(user: SessionUser, input: { assignmentId: string; purpose: string; exerciseId: string | null; name: string; buffer: Buffer }) {
  const metadata = validateUpload(input.name, input.buffer.length, uploadLimit());
  await requireUploadAccess(user, input.assignmentId, input.purpose, input.exerciseId);
  const object = await uploadObject(storageProvider(), input.buffer, metadata);
  try {
    const file = await repository.createFile({ provider: object.provider, storageKey: object.key, bucket: object.bucket, fileName: metadata.fileName, mimeType: metadata.mimeType, size: input.buffer.length, uploadedBy: user.userId, assignmentId: input.assignmentId, purpose: input.purpose, exerciseId: input.exerciseId });
    return { id: file.id, url: `/api/files/${file.id}`, name: file.fileName, size: file.size };
  } catch (error) { await removeObject(object).catch(() => undefined); throw error; }
}
export async function downloadFile(user: SessionUser, id: string) {
  const file = await repository.findFile(id);
  if (!file || !await canDownloadFile(user, file)) throw new ApplicationError("Không tìm thấy tệp hoặc không có quyền tải", 404);
  if (file.provider !== "cloudinary" && file.provider !== "minio") throw new ApplicationError("Kho lưu trữ không hợp lệ", 503);
  return objectDownloadUrl({ provider: file.provider, key: file.storageKey, bucket: file.bucket }, file.fileName);
}
export async function attachmentNames(urls: string[]) {
  const files = await repository.findFiles(urls.filter((url) => FILE_PATH.test(url)).map((url) => url.split("/").pop()!));
  const names = new Map(files.map((file) => [`/api/files/${file.id}`, file.fileName]));
  return urls.map((url) => ({ url, name: names.get(url) || url }));
}
