export class BodyTooLargeError extends Error {}
export async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Thiếu dữ liệu");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new BodyTooLargeError("Tệp quá lớn"); }
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } finally { reader.releaseLock(); }
}
