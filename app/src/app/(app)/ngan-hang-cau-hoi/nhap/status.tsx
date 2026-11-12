export const KIND_LABEL: Record<string, string> = { QUESTIONS: "Tập câu hỏi", TEST: "Đề kiểm tra" };

const STATUS: Record<string, [string, string]> = {
  PENDING: ["Đang chờ", "bg-slate-100 text-slate-700"],
  RUNNING: ["AI đang đọc tệp…", "bg-blue-100 text-blue-800"],
  DONE: ["Hoàn tất", "bg-green-100 text-green-800"],
  FAILED: ["Thất bại", "bg-red-100 text-red-700"],
};

export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, "bg-slate-100 text-slate-700"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
