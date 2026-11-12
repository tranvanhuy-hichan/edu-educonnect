import { redirect } from "next/navigation";
import { getMe } from "@/lib/guard";
import { getSchoolSetting } from "@/lib/school-setting";
import { Shell } from "@/components/layout/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // đọc phiên và cấu hình trường song song (tiết kiệm một lượt chờ CSDL)
  const [me, brand] = await Promise.all([getMe(), getSchoolSetting()]);
  if (!me) redirect("/login");
  return (
    <Shell roles={me.roles} userName={me.name} name={brand.schoolName} logo={brand.logoUrl ?? ""} mustChange={me.mustChangePwd} showOnboarding={!me.onboarded}>
      {children}
    </Shell>
  );
}
