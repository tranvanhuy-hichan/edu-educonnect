import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { getSchoolSetting } from "@/lib/school-setting";
import { DEFAULT_THEME, PRIMARY_COLOR, fontsHref, themeCss } from "@/lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getSchoolSetting();
  const icon = brand.logoUrl || "/favicon.svg";
  return {
    title: `${brand.schoolName} — EduConnect`,
    description: `${brand.schoolName} — Hệ thống quản lý trường học & Sổ liên lạc điện tử`,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: brand.logoUrl
        ? [{ url: icon }]
        : [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: [icon],
      apple: brand.logoUrl
        ? [{ url: icon }]
        : [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: brand.schoolName,
    },
  };
}

// Điện thoại: khoá thu/phóng màn hình bằng hai ngón, theme color PWA
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: PRIMARY_COLOR,
};

// Mọi trang đều cần phiên đăng nhập / dữ liệu: không dựng tĩnh lúc build (build không được chạm CSDL).
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = DEFAULT_THEME;
  const mode = (await cookies()).get("mode")?.value;
  const dark = mode === "dark" ? true : mode === "light" ? false : theme.dark;
  const href = fontsHref(theme);

  return (
    <html lang="vi" data-dark={dark ? "1" : "0"} suppressHydrationWarning>
      <head>
        {href && <link rel="stylesheet" href={href} />}
        <style id="theme-vars" dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
