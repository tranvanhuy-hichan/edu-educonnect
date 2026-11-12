import { redirect } from "next/navigation";
import { getSchoolSetting } from "@/lib/school-setting";
import { requireParentIdentity } from "@/lib/auth/parent-session";
import { parentGate } from "@/modules/parent/parent-auth.service";
import { ParentAuthShell } from "../auth-shell";
import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đặt mật khẩu mới · Sổ liên lạc điện tử" };

export default async function SetPasswordPage() {
  const parent = await requireParentIdentity();
  const gate = parentGate(parent);
  if (gate !== "password") redirect(gate === "verify" ? "/phu-huynh/xac-minh" : "/phu-huynh");
  const brand = await getSchoolSetting();
  return (
    <ParentAuthShell name={brand.schoolName} logo={brand.logoUrl ?? ""} title="Đặt mật khẩu mới">
      <SetPasswordForm />
    </ParentAuthShell>
  );
}
