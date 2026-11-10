import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { getMe } from "@/lib/guard";
import { themeForRoles, fontsHref, themeCss } from "@/lib/theme";

export const metadata: Metadata = {
  title: "EduConnect — THPT Sơn Hà",
  description: "EduConnect — Hệ thống quản lý trường học & Sổ liên lạc điện tử THPT Sơn Hà",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EduConnect",
  },
};

// Điện thoại: khoá thu/phóng màn hình bằng hai ngón, theme color PWA
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ea580c",
};

// Mọi trang đều cần phiên đăng nhập / dữ liệu: không dựng tĩnh lúc build (build không được chạm CSDL).
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getMe();
  const theme = themeForRoles(me?.roles ?? []);
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
