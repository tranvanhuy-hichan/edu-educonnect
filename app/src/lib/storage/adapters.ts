import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { Client } from "minio";
import { cloudinaryConfig, minioConfig, type StorageProvider } from "./config";
import { attachmentDisposition } from "./validation";

export type StorageObject = { provider: StorageProvider; key: string; bucket: string | null };
export async function uploadObject(provider: StorageProvider, buffer: Buffer, metadata: { extension: string; mimeType: string; fileName: string }): Promise<StorageObject> {
  const safeName = metadata.fileName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_") || `file.${metadata.extension}`;
  const key = `educonnect/content/${randomUUID()}/${safeName}`;
  if (provider === "cloudinary") {
    cloudinary.config(cloudinaryConfig());
    const result = await new Promise<{ public_id: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream({ public_id: key, resource_type: "raw", type: "authenticated", overwrite: false }, (error, result) => error || !result ? reject(new Error("Không thể tải tệp lên Cloudinary")) : resolve(result)).end(buffer);
    });
    return { provider, key: result.public_id, bucket: null };
  }
  const config = minioConfig();
  await new Client(config.client).putObject(config.bucket, key, buffer, buffer.length, { "Content-Type": metadata.mimeType, "Content-Disposition": attachmentDisposition(metadata.fileName) });
  return { provider, key, bucket: config.bucket };
}
export async function objectDownloadUrl(object: StorageObject, fileName: string) {
  if (object.provider === "cloudinary") {
    cloudinary.config(cloudinaryConfig());
    return cloudinary.utils.private_download_url(object.key, "", { resource_type: "raw", type: "authenticated", attachment: true, expires_at: Math.floor(Date.now() / 1000) + 60 });
  }
  const config = minioConfig();
  return new Client(config.client).presignedGetObject(object.bucket || config.bucket, object.key, 60, { "response-content-disposition": attachmentDisposition(fileName) });
}
export async function removeObject(object: StorageObject) {
  if (object.provider === "cloudinary") {
    cloudinary.config(cloudinaryConfig());
    await cloudinary.uploader.destroy(object.key, { resource_type: "raw", type: "authenticated", invalidate: true });
  } else {
    const config = minioConfig();
    await new Client(config.client).removeObject(object.bucket || config.bucket, object.key);
  }
}
