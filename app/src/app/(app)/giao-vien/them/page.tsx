import Link from "next/link";
import { MANAGER_ROLES, requireRole } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { Title } from "@/components/ui";
import { TeacherFields } from "../teacher-fields";
import { createTeacher } from "../actions";

export default async function NewTeacher() {
  await requireRole(...MANAGER_ROLES);
  return (
    <div className="space-y-4">
      <Title>Thêm giáo viên</Title>
      <ActionForm action={createTeacher} submit="Lưu giáo viên & tạo tài khoản" className="w-full space-y-4"><TeacherFields create /></ActionForm>
    </div>
  );
}
