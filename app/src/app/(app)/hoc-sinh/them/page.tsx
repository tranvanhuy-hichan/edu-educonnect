import Link from "next/link";
import { db } from "@/lib/db";
import { MANAGER_ROLES, requireRole } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { Card, Title } from "@/components/ui";
import { StudentFields } from "../student-fields";
import { createStudent } from "../actions";

export default async function NewStudent() {
  await requireRole(...MANAGER_ROLES);
  const classes = await db.schoolClass.findMany({ where: { academicYear: { endDate: { gte: new Date() } } }, orderBy: { className: "asc" }, include: { academicYear: true } });
  return (
    <div className="space-y-4">
      <Title>Thêm học sinh</Title>
      <ActionForm action={createStudent} submit="Lưu học sinh & tạo tài khoản" className="w-full space-y-4"><StudentFields classes={classes.map((c) => ({ id: c.id, label: `${c.className} (${c.academicYear.yearName})` }))} /></ActionForm>
      <Card>
        <h2 className="mb-1 font-semibold">Nhập nhiều học sinh cùng lúc</h2>
        <p className="text-sm text-slate-500">Vào trang chi tiết một lớp → nút <b>Nhập danh sách học sinh</b> để dán danh sách (Họ tên, ngày sinh, tên PH, SĐT PH), tạo tài khoản, xếp lớp và tải file mật khẩu.</p>
        <Link href="/lop-hoc" className="mt-2 inline-block text-sm text-orange-700 underline">Đến danh sách lớp →</Link>
      </Card>
    </div>
  );
}
