import type { MetadataRoute } from "next";
import { getSchoolSetting } from "@/lib/school-setting";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getSchoolSetting();
  const customIcon = brand.logoUrl
    ? [
        {
          src: brand.logoUrl,
          sizes: "any",
          type: "image/png",
          purpose: "any" as const,
        },
      ]
    : [];

  return {
    name: `${brand.schoolName} — EduConnect`,
    short_name: brand.schoolName || "EduConnect",
    description: `Hệ thống quản lý trường học và học tập trực tuyến ${brand.schoolName}`,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ea580c",
    orientation: "portrait",
    icons: [
      ...customIcon,
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
