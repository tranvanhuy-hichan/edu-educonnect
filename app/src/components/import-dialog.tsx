"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { DialogButton, useDialogClose } from "@/components/dialog";
import { Field, inputCls } from "@/components/ui";

export type ImportDialogProps = {
  /** Môn và khối đã chọn sẵn (từ trang Ngân hàng câu hỏi hoặc bài học). */
  subjectId: string;
  gradeLevelId: string;
  /** Các bài học của giáo viên trong kho thuộc đúng môn + khối này. */
  lessons: { id: string; title: string; orderNo: number }[];
  /** Bài học chọn sẵn (khi mở từ trong một bài học). */
  defaultLessonId?: string;
  /** Giới hạn dung lượng tệp (byte), mặc định 10 MB. */
  maxBytes?: number;
  label?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
};

const ACCEPT = ".docx,.pdf,.txt,.png,.jpg,.jpeg,.webp";

function ImportForm({ subjectId, gradeLevelId, lessons, defaultLessonId, maxBytes = 10 * 1024 * 1024 }: ImportDialogProps) {
  const router = useRouter();
  const close = useDialogClose();
  const [kind, setKind] = useState<"QUESTIONS" | "TEST">("QUESTIONS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) { setError("Chọn tệp cần nhập."); return; }
    if (file.size > maxBytes) { setError(`Tệp không được quá ${Math.round(maxBytes / 1024 / 1024)} MB.`); return; }
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    body.set("subjectId", subjectId);
    body.set("gradeLevelId", gradeLevelId);
    const lesson = (form.elements.namedItem("libraryLessonId") as HTMLSelectElement).value;
    if (lesson) body.set("libraryLessonId", lesson);
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/imports", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Không tạo được phiên nhập. Vui lòng thử lại.");
      close?.();
      router.push(`/ngan-hang-cau-hoi/nhap/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const radio = "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={radio}><input type="radio" name="kind" checked={kind === "QUESTIONS"} onChange={() => setKind("QUESTIONS")} className="mt-1" /><span><b>Tập câu hỏi</b><br /><span className="text-xs font-normal text-slate-500">Chỉ thêm các câu vào ngân hàng câu hỏi</span></span></label>
        <label className={radio}><input type="radio" name="kind" checked={kind === "TEST"} onChange={() => setKind("TEST")} className="mt-1" /><span><b>Đề kiểm tra</b><br /><span className="text-xs font-normal text-slate-500">Thêm câu vào ngân hàng và tạo luôn bài tập mẫu theo đề</span></span></label>
      </div>
      <Field label="Tệp (Word .docx, PDF, ảnh, văn bản)">
        <input type="file" name="file" accept={ACCEPT} disabled={busy} className="block w-full rounded-md border bg-white p-2 text-sm font-normal file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm" />
      </Field>
      <Field label={kind === "TEST" ? "Bài học chứa đề (bỏ trống để tạo bài học mới)" : "Gắn vào bài học (tùy chọn)"}>
        <select name="libraryLessonId" defaultValue={defaultLessonId ?? ""} disabled={busy} className={inputCls + " w-full"}>
          <option value="">{kind === "TEST" ? "Tạo bài học mới theo tên đề" : "Chưa phân bài"}</option>
          {[...lessons].sort((a, b) => a.orderNo - b.orderNo).map((l) => <option key={l.id} value={l.id}>Bài {l.orderNo}. {l.title}</option>)}
        </select>
      </Field>
      <p className="text-xs text-slate-500">AI đọc tệp và tự lưu câu hỏi vào ngân hàng (môn và khối đã chọn). Câu nào AI không chắc chắn được gắn nhãn &quot;Chờ kiểm tra&quot; để bạn duyệt trước khi dùng cho học sinh. Công thức Word được chuyển thành LaTeX; ảnh trong tệp Word được giữ lại. Hãy xem lại đáp án vì AI có thể sai.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-2 self-start rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{busy ? "Đang tải tệp lên…" : "Bắt đầu nhập"}
      </button>
    </form>
  );
}

/** Nút + hộp thoại nhập câu hỏi/đề kiểm tra từ tệp bằng AI. Sau khi tạo phiên sẽ chuyển tới trang theo dõi /ngan-hang-cau-hoi/nhap/{id}. */
export function ImportDialog({ label = "Nhập từ tệp bằng AI", variant = "secondary", ...props }: ImportDialogProps) {
  return (
    <DialogButton label={label} title="Nhập câu hỏi từ tệp bằng AI" variant={variant}>
      <ImportForm {...props} />
    </DialogButton>
  );
}
