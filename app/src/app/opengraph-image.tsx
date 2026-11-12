import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSchoolSetting } from "@/lib/school-setting";
import { PRIMARY_COLOR } from "@/lib/theme";

// Ảnh xem trước (thumbnail) khi chia sẻ link qua Zalo / Messenger / Facebook
export const alt = "EduConnect";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadLogo(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type") ?? "";
    // satori chỉ hỗ trợ png/jpeg
    if (!res.ok || !/image\/(png|jpe?g)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const brand = await getSchoolSetting();
  const [bold, regular, logo] = await Promise.all([
    readFile(path.join(process.cwd(), "src/assets/og-bold.ttf")),
    readFile(path.join(process.cwd(), "src/assets/og-regular.ttf")),
    loadLogo(brand.logoUrl),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "0 90px", color: "#fff", fontFamily: "Vietnamese",
          background: `linear-gradient(135deg, ${PRIMARY_COLOR} 0%, #14532d 100%)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 190, height: 190, borderRadius: 40, background: "#fff", display: "flex",
              alignItems: "center", justifyContent: "center", marginRight: 56, flexShrink: 0,
            }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} width={150} height={150} style={{ objectFit: "contain" }} alt="" />
            ) : (
              <div style={{ fontSize: 110, fontWeight: 700, color: PRIMARY_COLOR, display: "flex" }}>E</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: 2, opacity: 0.9, display: "flex" }}>EduConnect</div>
            <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.2, marginTop: 8, display: "flex", maxWidth: 800 }}>
              {brand.schoolName}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Vietnamese", data: regular, weight: 400, style: "normal" },
        { name: "Vietnamese", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
