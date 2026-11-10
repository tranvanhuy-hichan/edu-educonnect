import { getSchoolSetting } from "@/lib/school-setting";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const brand = await getSchoolSetting();
  return { title: `Đăng nhập · ${brand.schoolName}` };
}

export default async function Login() {
  const brand = await getSchoolSetting();
  return <LoginForm name={brand.schoolName} logo={brand.logoUrl ?? ""} />;
}
