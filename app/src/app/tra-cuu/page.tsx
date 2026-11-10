import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PublicTraCuuPage() {
  redirect("/phu-huynh/dang-nhap");
}
