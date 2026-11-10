import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { getMe } from "@/lib/guard";
import { themeForRoles, fontsHref, themeCss } from "@/lib/theme";

export const metadata: Metadata = {
  title: "EduConnect — THPT Sơn Hà",
  description: "EduConnect — hệ thống quản lý trường học THPT Sơn Hà",
  icons: { icon: "/logo-truong-placeholder.svg" },
};

// Điện thoại: khoá thu/phóng màn hình bằng hai ngón (giao diện đã đặt cỡ chữ ô nhập 16px nên iOS cũng không tự phóng khi bấm vào ô).
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

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
