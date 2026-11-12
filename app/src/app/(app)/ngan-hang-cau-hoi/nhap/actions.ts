"use server";
import { revalidatePath } from "next/cache";
import { assertRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import { approveImportQuestions } from "@/modules/importer/importer.service";

const TEACH = [...MANAGER_ROLES, ...TEACHING_ROLES];

function refresh(jobId: string) {
  revalidatePath(`/ngan-hang-cau-hoi/nhap/${jobId}`);
  revalidatePath("/ngan-hang-cau-hoi/nhap");
  revalidatePath("/ngan-hang-cau-hoi");
}

/** Giáo viên xác nhận tất cả các câu AI trích xuất trong phiên: chuyển từ "Chờ kiểm tra" sang dùng được trong bài tập. */
export const approveAll = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const jobId = str(fd, "jobId");
  const n = await approveImportQuestions(me, jobId);
  await audit(me.email, "approve_import_questions", "ImportJob", jobId);
  refresh(jobId);
  return n ? `Đã duyệt ${n} câu` : "Không có câu nào đang chờ kiểm tra";
});

export const approveOne = wrap(async (fd) => {
  const me = await assertRole(...TEACH);
  const jobId = str(fd, "jobId");
  await approveImportQuestions(me, jobId, str(fd, "questionId"));
  refresh(jobId);
  return "Đã duyệt câu hỏi";
});
