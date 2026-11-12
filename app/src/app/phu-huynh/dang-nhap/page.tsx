import { redirect } from "next/navigation";
import { getSchoolSetting } from "@/lib/school-setting";
import { getParentSession } from "@/lib/auth/parent-session";
import { isSmsEnabled } from "@/modules/sms/provider";
import { ParentLoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const brand = await getSchoolSetting();
  const icon = brand.logoUrl || "/favicon.svg";
  return {
    title: `Sổ liên lạc điện tử Phụ huynh · ${brand.schoolName}`,
    icons: {
      icon: [{ url: icon }],
      shortcut: [icon],
      apple: [{ url: icon }],
    },
  };
}

export default async function ParentLoginPage() {
  const parent = await getParentSession();
  if (parent) {
    redirect("/phu-huynh");
  }

  const brand = await getSchoolSetting();
  return <ParentLoginForm name={brand.schoolName} logo={brand.logoUrl ?? ""} smsEnabled={isSmsEnabled()} />;
}
