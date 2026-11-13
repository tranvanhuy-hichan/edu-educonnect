import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole,type Role } from "@/lib/guard";
import { ROLE_LABEL } from "@/lib/nav";
import { AccountTabs } from "@/components/account-tabs";
import { Card,Title } from "@/components/ui";
import { BulkResetPasswords } from "@/components/bulk-reset-passwords";
import { BULK_RESET_BATCH } from "@/modules/admin/admin.service";
import { previewBulkReset,runBulkReset } from "../actions";
export default async function AccountSecurity() {
  await requireRole("ADMIN");
  const year=await db.academicYear.findFirst({where:{startDate:{lte:new Date()}},orderBy:{startDate:"desc"}});
  const classes=year?await db.schoolClass.findMany({where:{academicYearId:year.id},select:{id:true,className:true},orderBy:{className:"asc"}}):[];
  const roles=(["STUDENT","HOMEROOM_TEACHER","SUBJECT_TEACHER","LIBRARIAN","VICE_PRINCIPAL","PRINCIPAL","ADMIN"] as Role[]).map(r=>({value:r,label:ROLE_LABEL[r]}));
  return <div className="space-y-4"><Title>Tài khoản & Nhân sự</Title><AccountTabs current="/tai-khoan/bao-mat" /><Card className="space-y-3"><h2 className="font-semibold">Cấp lại mật khẩu theo nhóm</h2><BulkResetPasswords roles={roles} classes={classes.map(c=>({value:c.id,label:c.className}))} batchSize={BULK_RESET_BATCH} preview={previewBulkReset} run={runBulkReset} /></Card><Card className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Rà soát tài khoản</h2><p className="text-sm text-slate-500">Tài khoản chưa sử dụng, lâu không đăng nhập hoặc đang khóa.</p></div><Link href="/tai-khoan/ra-soat" className="rounded-md border px-4 py-2 text-sm hover:bg-slate-50">Mở rà soát</Link></Card></div>;
}
