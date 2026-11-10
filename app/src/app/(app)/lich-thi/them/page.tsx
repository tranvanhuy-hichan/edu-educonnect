import { requireRole, MANAGER_ROLES } from "@/lib/guard";
import { Title } from "@/components/ui";
import { ExamBuilder } from "@/components/exam-builder";
import { examFormData } from "@/modules/exams/queries";
export default async function NewExam() {
  await requireRole(...MANAGER_ROLES);
  return <div className="space-y-4"><Title>Tạo lịch thi</Title><ExamBuilder data={await examFormData()} /></div>;
}
