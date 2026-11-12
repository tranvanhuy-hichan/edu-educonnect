/** Mô tả thiết bị từ User-Agent: "Chrome trên Windows". Không cần chính xác tuyệt đối, chỉ để người dùng nhận ra thiết bị của mình. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Thiết bị không rõ";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Trình duyệt";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} trên ${os}` : browser;
}

/** Che bớt địa chỉ IP (113.161.*.*): đủ để nhận ra nơi đăng nhập, không lưu địa chỉ đầy đủ. */
export function maskIp(ip: string | null | undefined): string {
  const v = (ip ?? "").trim();
  if (!v || v === "unknown") return "không rõ";
  if (v.includes(":")) return `${v.split(":").slice(0, 2).join(":")}::*`;
  const p = v.split(".");
  return p.length === 4 ? `${p[0]}.${p[1]}.*.*` : "không rõ";
}
