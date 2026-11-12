import { redirect } from "next/navigation";
import { getSchoolSetting } from "@/lib/school-setting";
import { requireParentIdentity } from "@/lib/auth/parent-session";
import { parentGate } from "@/modules/parent/parent-auth.service";
import { maskPhone, toVnMobile } from "@/modules/sms/phone";
import { ParentAuthShell } from "../auth-shell";
import { VerifyPhoneForm } from "./verify-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xác minh số điện thoại · Sổ liên lạc điện tử" };

export default async function VerifyPhonePage() {
  const parent = await requireParentIdentity();
  const gate = parentGate(parent);
  if (gate !== "verify") redirect(gate === "password" ? "/phu-huynh/doi-mat-khau" : "/phu-huynh");
  const brand = await getSchoolSetting();
  const mobile = toVnMobile(parent.phone);
  return (
    <ParentAuthShell name={brand.schoolName} logo={brand.logoUrl ?? ""} title="Xác minh số điện thoại">
      <VerifyPhoneForm masked={mobile ? maskPhone(mobile) : parent.phone.slice(0, 3) + "****"} />
    </ParentAuthShell>
  );
}
