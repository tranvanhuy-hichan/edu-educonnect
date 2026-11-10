import assert from "node:assert/strict";
import { test } from "node:test";
import { Writable } from "node:stream";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { uploadObject, objectDownloadUrl, removeObject } from "../src/lib/storage/adapters";

function environment(values: Record<string, string>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}

test("Cloudinary stores protected raw files and signs expiring download URLs", async () => {
  const restore = environment({ CLOUDINARY_CLOUD_NAME: "test-cloud", CLOUDINARY_API_KEY: "test-key", CLOUDINARY_API_SECRET: "test-secret", STORAGE_PROVIDER: "minio" });
  const original = cloudinary.uploader.upload_stream;
  let options: Record<string, unknown> = {}, uploaded = Buffer.alloc(0);
  cloudinary.uploader.upload_stream = ((...args: unknown[]) => {
    options = args[0] as Record<string, unknown>;
    const callback = args[1] as (error: null, response: { public_id: string }) => void;
    const stream = new Writable({ write(chunk, _encoding, done) { uploaded = Buffer.concat([uploaded, chunk]); done(); } });
    stream.on("finish", () => callback(null, { public_id: String(options.public_id) }));
    return stream;
  }) as typeof original;
  try {
    const object = await uploadObject("cloudinary", Buffer.from("test-document"), { extension: "pdf", fileName: "Giáo án.pdf", mimeType: "application/pdf" });
    assert.equal(uploaded.toString(), "test-document"); assert.equal(options.resource_type, "raw"); assert.equal(options.type, "authenticated"); assert.equal(options.overwrite, false);
    assert.equal(object.provider, "cloudinary");
    const url = new URL(await objectDownloadUrl(object, "Giáo án.pdf"));
    assert.equal(url.hostname, "api.cloudinary.com"); assert.match(url.pathname, /\/raw\/download$/);
    assert.equal(url.searchParams.get("type"), "authenticated"); assert.ok(url.searchParams.has("signature"));
    const expires = Number(url.searchParams.get("expires_at"));
    assert.ok(expires > Date.now() / 1000 && expires <= Date.now() / 1000 + 61);
  } finally { cloudinary.uploader.upload_stream = original; restore(); }
});

test("MinIO SDK uploads, signs downloads and removes the same object using its saved bucket", async () => {
  const objects = new Map<string, Buffer>();
  let disposition = "";
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost");
    if (request.method === "PUT") {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const data = Buffer.concat(chunks); objects.set(url.pathname, data);
      disposition = String(request.headers["content-disposition"]);
      response.setHeader("etag", `"${createHash("md5").update(data).digest("hex")}"`); response.end();
    } else if (request.method === "DELETE") { objects.delete(url.pathname); response.writeHead(204); response.end(); }
    else if (request.method === "GET") { const data = objects.get(url.pathname); response.writeHead(data ? 200 : 404); response.end(data); }
    else { response.writeHead(200); response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const restore = environment({ MINIO_ENDPOINT: `http://127.0.0.1:${port}`, MINIO_ACCESS_KEY: "test-access", MINIO_SECRET_KEY: "test-secret", MINIO_BUCKET: "private-test", MINIO_REGION: "us-east-1" });
  try {
    const object = await uploadObject("minio", Buffer.from("minio-document"), { extension: "pdf", fileName: "Đề bài.pdf", mimeType: "application/pdf" });
    assert.equal(object.bucket, "private-test"); assert.match(disposition, /filename\*=UTF-8/);
    process.env.MINIO_BUCKET = "a-different-default";
    const url = new URL(await objectDownloadUrl(object, "Đề bài.pdf"));
    assert.match(url.pathname, /^\/private-test\//); assert.equal(url.searchParams.get("X-Amz-Expires"), "60");
    assert.equal(await (await fetch(url)).text(), "minio-document");
    await removeObject(object); assert.equal(objects.size, 0);
  } finally { restore(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
