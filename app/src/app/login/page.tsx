import { getSchoolSetting } from "@/lib/school-setting";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const brand = await getSchoolSetting();
  const icon = brand.logoUrl || "/favicon.svg";
  return {
    title: `Đăng nhập · ${brand.schoolName}`,
    icons: {
      icon: [{ url: icon }],
      shortcut: [icon],
      apple: [{ url: icon }],
    },
  };
}

export default async function Login() {
  const brand = await getSchoolSetting();
  return <LoginForm name={brand.schoolName} logo={brand.logoUrl ?? ""} />;
}
