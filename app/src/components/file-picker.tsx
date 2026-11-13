"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Trash2, UploadCloud } from "lucide-react";

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Ô chọn tệp cho biểu mẫu: bấm hoặc kéo thả, hiện tên/dung lượng (và ảnh xem trước nếu là ảnh) thay cho nút "Browse" của trình duyệt.
 * Vẫn là `<input type="file" name>` thật nên gửi cùng biểu mẫu như bình thường; `round` cắt ảnh xem trước thành hình tròn (logo).
 */
export function FilePicker({ name, accept, maxMB, hint, round, disabled, required, onChange }: {
  name: string; accept?: string; maxMB?: number; hint?: string; round?: boolean; disabled?: boolean; required?: boolean; onChange?: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file?.type.startsWith("image/")) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(f: File | null) {
    setError("");
    if (f && maxMB && f.size > maxMB * 1048576) { setError(`Tệp quá lớn (tối đa ${maxMB} MB).`); f = null; }
    if (input.current) {
      if (f) { const dt = new DataTransfer(); dt.items.add(f); input.current.files = dt.files; } else input.current.value = "";
    }
    setFile(f); onChange?.(f);
  }

  return (
    <div className="space-y-1">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) pick(e.dataTransfer.files[0] ?? null); }}
        className={`flex flex-wrap items-center gap-4 rounded-xl border-2 border-dashed p-4 transition-colors ${over ? "border-orange-500 bg-orange-50 dark:bg-orange-500/10" : "border-slate-300 bg-slate-50/60 dark:bg-slate-800/40"} ${disabled ? "opacity-60" : ""}`}>
        {file ? (
          <>
            {preview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt="" className={`size-14 shrink-0 border object-cover ${round ? "rounded-full" : "rounded-lg"}`} />
              : <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-white text-orange-700 ring-1 ring-slate-200"><FileText className="size-6" /></span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs font-normal text-slate-500">{size(file.size)}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="h-9 rounded-md border bg-white px-3 text-sm font-medium hover:bg-slate-50">Đổi tệp</button>
              <button type="button" disabled={disabled} onClick={() => pick(null)} aria-label="Bỏ tệp đã chọn" className="grid size-9 place-items-center rounded-md border bg-white text-red-600 hover:bg-red-50"><Trash2 className="size-4" /></button>
            </div>
          </>
        ) : (
          <>
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-orange-100 text-orange-700"><UploadCloud className="size-6" /></span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">Kéo thả tệp vào đây hoặc bấm để chọn</p>
              {hint && <p className="text-xs font-normal text-slate-500">{hint}{maxMB ? ` Tối đa ${maxMB} MB.` : ""}</p>}
            </div>
            <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="h-9 rounded-md border bg-white px-4 text-sm font-medium text-orange-700 hover:bg-orange-50">Chọn tệp</button>
          </>
        )}
        <input ref={input} type="file" name={name} accept={accept} required={required} disabled={disabled} onChange={(e) => pick(e.target.files?.[0] ?? null)} className="sr-only" tabIndex={-1} aria-label="Chọn tệp" />
      </div>
      {error && <p role="alert" className="text-xs font-normal text-red-600">{error}</p>}
    </div>
  );
}
