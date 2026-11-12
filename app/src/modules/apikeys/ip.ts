const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const toInt = (ip: string): number | null => {
  const m = V4.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.some((n) => n > 255) ? null : (((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]);
};

/** Mục hợp lệ trong danh sách IP được phép: IPv4, IPv4/CIDR (vd 113.161.0.0/16) hoặc IPv6 đầy đủ. */
export function isValidAllowEntry(entry: string): boolean {
  const [ip, bits, extra] = entry.split("/");
  if (extra !== undefined) return false;
  if (toInt(ip) !== null) return bits === undefined || (/^\d{1,2}$/.test(bits) && Number(bits) <= 32);
  return bits === undefined && /^[0-9a-fA-F:]{3,45}$/.test(ip) && ip.includes(":");
}

/** IP có nằm trong danh sách cho phép không (danh sách rỗng = không giới hạn theo IP). */
export function ipAllowed(ip: string, list: readonly string[]): boolean {
  if (!list.length) return true;
  const n = toInt(ip);
  return list.some((entry) => {
    const [base, bits] = entry.split("/");
    if (bits === undefined) return entry.toLowerCase() === ip.toLowerCase();
    const b = toInt(base);
    if (n === null || b === null) return false;
    const mask = Number(bits) === 0 ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  });
}
