import { redirect } from "next/navigation";
import { getMe } from "@/lib/guard";
import { getSchoolSetting } from "@/lib/school-setting";
import { Shell } from "@/components/layout/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  const brand = await getSchoolSetting();
  return (
    <Shell roles={me.roles} userName={me.name} name={brand.schoolName} logo={brand.logoUrl ?? ""} mustChange={me.mustChangePwd}>
      {children}
    </Shell>
  );
}
