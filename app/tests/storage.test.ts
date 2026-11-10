import assert from "node:assert/strict";
import { test } from "node:test";
import { storageProvider, minioConfig, cloudinaryConfig, uploadLimit } from "../src/lib/storage/config";
import { attachmentLinks, validateUpload, attachmentDisposition } from "../src/lib/storage/validation";

test("storage defaults to Cloudinary, honors MinIO, and never silently falls back", () => {
  assert.equal(storageProvider({}), "cloudinary"); assert.equal(storageProvider({ STORAGE_PROVIDER: " " }), "cloudinary");
  assert.equal(storageProvider({ STORAGE_PROVIDER: "minio" }), "minio");
  assert.throws(() => storageProvider({ STORAGE_PROVIDER: "local" }), /STORAGE_PROVIDER/);
  assert.throws(() => cloudinaryConfig({}), /CLOUDINARY/);
});
test("MinIO configuration parses endpoint, SSL, bucket and credentials without guessing paths", () => {
  const base = { MINIO_ACCESS_KEY: "test", MINIO_SECRET_KEY: "test-secret" };
  const config = minioConfig({ ...base, MINIO_ENDPOINT: "http://localhost:9000", MINIO_BUCKET: "test-bucket" });
  assert.equal(config.client.endPoint, "localhost"); assert.equal(config.client.port, 9000); assert.equal(config.client.useSSL, false);
  const hostname = minioConfig({ ...base, MINIO_ENDPOINT: "minio.example.test", MINIO_PORT: "9000", MINIO_USE_SSL: "false" });
  assert.equal(hostname.client.port, 9000); assert.equal(hostname.client.useSSL, false);
  assert.equal(minioConfig({ ...base, MINIO_ENDPOINT: "https://files.example.test" }).client.port, 443);
  assert.throws(() => minioConfig({ ...base, MINIO_ENDPOINT: "https://files.example.test/bucket" }), /MINIO_ENDPOINT/);
  assert.throws(() => minioConfig({ ...base, MINIO_ENDPOINT: "ftp://files.example.test" }), /MINIO_ENDPOINT/);
});
test("file validation rejects executable extensions, empty and excessive content", () => {
  const limit = uploadLimit({}); assert.equal(limit, 10 * 1024 * 1024);
  const file = validateUpload("../Giáo án.docx", 100, limit);
  assert.equal(file.fileName, ".._Giáo án.docx"); assert.match(file.mimeType, /wordprocessingml/);
  assert.throws(() => validateUpload("script.html", 100, limit), /Định dạng/);
  assert.throws(() => validateUpload("file.pdf", 0, limit), /dữ liệu/);
  assert.throws(() => validateUpload("file.pdf", limit + 1, limit), /không quá/);
  assert.throws(() => uploadLimit({ UPLOAD_MAX_MB: "11" }), /UPLOAD_MAX_MB/);
});
test("attachment references accept protected paths and legacy links while rejecting injected protocols", () => {
  assert.deepEqual(attachmentLinks("/api/files/c123\nhttps://example.test/a.pdf\n/api/files/c123"), ["/api/files/c123", "https://example.test/a.pdf"]);
  assert.throws(() => attachmentLinks("javascript:alert(1)"), /hợp lệ/);
  assert.throws(() => attachmentLinks("//other.example.test/a.pdf"), /hợp lệ/);
  assert.throws(() => attachmentLinks("/api/files/../../secret"), /hợp lệ/);
  const header = attachmentDisposition('Giáo án "A".pdf');
  assert.match(header, /filename\*=UTF-8''/); assert.ok(!header.includes("\n"));
});
