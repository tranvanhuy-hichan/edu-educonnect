export type StorageProvider = "cloudinary" | "minio";
export function storageProvider(env: Readonly<Record<string, string | undefined>> = process.env): StorageProvider {
  const value = env.STORAGE_PROVIDER?.trim().toLowerCase() || "cloudinary";
  if (value !== "cloudinary" && value !== "minio") throw new Error("STORAGE_PROVIDER chỉ nhận cloudinary hoặc minio");
  return value;
}
export function uploadLimit(env: Readonly<Record<string, string | undefined>> = process.env) {
  const megabytes = Number(env.UPLOAD_MAX_MB || 10);
  if (!Number.isInteger(megabytes) || megabytes < 1 || megabytes > 10) throw new Error("UPLOAD_MAX_MB phải từ 1 đến 10");
  return megabytes * 1024 * 1024;
}
export function cloudinaryConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) throw new Error("Chưa cấu hình Cloudinary: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
  return { cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true };
}
export function minioConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (!env.MINIO_ENDPOINT || !env.MINIO_ACCESS_KEY || !env.MINIO_SECRET_KEY) throw new Error("Chưa cấu hình MinIO: MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY");
  const raw = env.MINIO_ENDPOINT.trim();
  const url = new URL(raw.includes("://") ? raw : `${env.MINIO_USE_SSL === "false" ? "http" : "https"}://${raw}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("MINIO_ENDPOINT phải là địa chỉ máy chủ HTTP/HTTPS, không kèm đường dẫn");
  if (env.MINIO_USE_SSL && !["true", "false"].includes(env.MINIO_USE_SSL)) throw new Error("MINIO_USE_SSL chỉ nhận true hoặc false");
  const port = Number(env.MINIO_PORT || url.port || (url.protocol === "https:" ? 443 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MINIO_PORT không hợp lệ");
  const bucket = env.MINIO_BUCKET || "educonnect";
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("MINIO_BUCKET không hợp lệ");
  return { client: { endPoint: url.hostname, port, useSSL: url.protocol === "https:", accessKey: env.MINIO_ACCESS_KEY, secretKey: env.MINIO_SECRET_KEY, region: env.MINIO_REGION || "us-east-1" }, bucket };
}
