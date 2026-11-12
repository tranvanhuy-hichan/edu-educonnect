import { createHmac, timingSafeEqual } from "node:crypto";
export function credentialTag(hash: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET chưa được cấu hình");
  return createHmac("sha256", secret).update(hash).digest("hex");
}
export function matchesCredential(tag: string | undefined, hash: string): boolean {
  if (!tag || !/^[a-f0-9]{64}$/.test(tag)) return false;
  return timingSafeEqual(Buffer.from(tag, "hex"), Buffer.from(credentialTag(hash), "hex"));
}
