"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { FILE_ACCEPT } from "@/lib/storage/validation";

type Attachment = { url: string; name: string };
export function FileUploader({ name, purpose, assignmentId, exerciseId, initialFiles = [], multiple = true, maxBytes, accept = FILE_ACCEPT, hint }: { name: string; purpose: string; assignmentId?: string; exerciseId?: string; initialFiles?: Attachment[]; multiple?: boolean; maxBytes: number; accept?: string; hint?: string }) {
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    const prevent = (event: SubmitEvent) => { if (busy) { event.preventDefault(); event.stopImmediatePropagation(); setError("Vui lòng chờ tệp tải xong trước khi lưu."); } };
    form?.addEventListener("submit", prevent, true);
    return () => form?.removeEventListener("submit", prevent, true);
  }, [busy]);
  async function upload(selected: FileList | null) {
    if (!selected?.length) return;
    const form = ref.current?.closest("form");
    const field = form?.elements.namedItem("assignmentId") as HTMLInputElement | HTMLSelectElement | null;
    // Ảnh câu hỏi thuộc ngân hàng câu hỏi của giáo viên nên không cần chọn lớp · môn.
    const scope = assignmentId || field?.value || "";
    if (!scope && !["QUESTION", "LIBRARY", "IMPORT"].includes(purpose)) { setError("Chọn lớp · môn trước khi tải tệp."); return; }
    const selection = Array.from(selected);
    if (multiple && files.length + selection.length > 10) { setError("Tối đa 10 tệp đính kèm."); return; }
    if (selection.some((file) => file.size > maxBytes || !file.size)) { setError(`Mỗi tệp phải có dữ liệu và không quá ${maxBytes / 1024 / 1024} MB.`); return; }
    setBusy(true); setError("");
    try {
      for (const file of selection) {
        const payload = new FormData(); payload.set("file", file); if (scope) payload.set("assignmentId", scope); payload.set("purpose", purpose);
        if (exerciseId) payload.set("exerciseId", exerciseId);
        const response = await fetch("/api/uploads", { method: "POST", body: payload });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || "Không tải được tệp. Vui lòng thử lại.");
        setFiles((previous) => multiple ? [...previous, { url: result.url, name: result.name }] : [{ url: result.url, name: result.name }]);
      }
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <div ref={ref} className="space-y-2">
    <input type="hidden" name={name} value={files.map((file) => file.url).join("\n")} />
    <div className="rounded-xl border border-dashed bg-slate-50 p-4">
      <button type="button" disabled={busy} onClick={() => { if (input.current) { input.current.value = ""; input.current.click(); } }} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-orange-700 disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{busy ? "Đang tải tệp…" : multiple ? "Chọn tệp đính kèm" : "Chọn tài liệu"}</button>
      <input ref={input} type="file" accept={accept} multiple={multiple} disabled={busy} onChange={(event) => void upload(event.target.files)} className="sr-only" aria-label="Chọn tệp để tải lên" />
      <p className="mt-2 text-xs font-normal text-slate-500">{hint ?? "PDF, Word, Excel, PowerPoint, ảnh, ZIP, MP3, MP4."} Tối đa {maxBytes / 1024 / 1024} MB/tệp.</p>
    </div>
    {files.length > 0 && <ul className="space-y-1">{files.map((file) => <li key={file.url} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs"><FileText className="size-4 shrink-0 text-orange-700" /><a href={file.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-orange-700 hover:underline">{file.name}</a><button type="button" disabled={busy} aria-label={`Bỏ đính kèm ${file.name}`} onClick={() => setFiles((previous) => previous.filter((item) => item.url !== file.url))} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="size-3.5" /></button></li>)}</ul>}
    <p aria-live="polite" className="text-xs font-normal text-red-600">{error}</p>
  </div>;
}
