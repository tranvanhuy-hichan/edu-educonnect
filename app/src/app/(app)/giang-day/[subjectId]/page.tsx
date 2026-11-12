import { redirect } from "next/navigation";
import { loadSubject, requireTeachingViewer } from "@/server/teaching-scope";

/** Không còn trang chọn khối riêng: chọn khối ngay trên thẻ môn ở trang Giảng dạy. */
export default async function TeachingSubject({ params }: { params: Promise<{ subjectId: string }> }) {
  const me = await requireTeachingViewer();
  const { subjectId } = await params;
  await loadSubject(me, subjectId);
  redirect(`/giang-day?mon=${subjectId}`);
}
