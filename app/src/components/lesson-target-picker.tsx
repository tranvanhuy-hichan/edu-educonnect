"use client";
import { useMemo, useState } from "react";
import { Field, inputCls } from "@/components/ui";

export type TargetOption = { id: string; classId: string; className: string; subjectId: string; subjectName: string; termId: string; termLabel: string };

/**
 * Chọn nơi đăng bài học: học kỳ → môn → một hoặc nhiều lớp (cùng môn, cùng kỳ).
 * Gửi `assignmentIds` (nhiều giá trị) và `assignmentId` (lớp đầu tiên, để ô tải tệp biết lớp và môn).
 */
export function LessonTargetPicker({ options, defaultTermId, defaultAssignmentId }: { options: TargetOption[]; defaultTermId?: string; defaultAssignmentId?: string }) {
  const preset = options.find((o) => o.id === defaultAssignmentId);
  const terms = useMemo(() => [...new Map(options.map((o) => [o.termId, o.termLabel])).entries()], [options]);
  const [termId, setTermId] = useState(preset?.termId ?? (terms.some(([id]) => id === defaultTermId) ? defaultTermId! : terms[0]?.[0] ?? ""));
  const inTerm = options.filter((o) => o.termId === termId);
  const subjects = useMemo(() => [...new Map(inTerm.map((o) => [o.subjectId, o.subjectName])).entries()], [inTerm]);
  const [subjectId, setSubjectId] = useState(preset?.subjectId ?? "");
  const subject = subjects.some(([id]) => id === subjectId) ? subjectId : subjects.length === 1 ? subjects[0][0] : "";
  const classes = inTerm.filter((o) => o.subjectId === subject).sort((a, b) => a.className.localeCompare(b.className, "vi", { numeric: true }));
  const [picked, setPicked] = useState<string[]>(preset ? [preset.id] : []);
  const chosen = classes.filter((c) => picked.includes(c.id)).map((c) => c.id);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="space-y-3">
      <input type="hidden" name="assignmentId" value={chosen[0] ?? ""} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Học kỳ · năm học">
          <select value={termId} onChange={(e) => { setTermId(e.target.value); setSubjectId(""); setPicked([]); }} className={inputCls + " w-full"}>
            {terms.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Field>
        <Field label="Môn học">
          <select value={subject} onChange={(e) => { setSubjectId(e.target.value); setPicked([]); }} className={inputCls + " w-full"} required>
            <option value="">-- chọn môn --</option>
            {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
      </div>
      <div className="space-y-1 text-xs font-semibold">
        <div className="flex items-center justify-between">
          <p>Đăng cho lớp ({chosen.length}/{classes.length})</p>
          {classes.length > 1 && <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => setPicked(chosen.length === classes.length ? [] : classes.map((c) => c.id))}>{chosen.length === classes.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}</button>}
        </div>
        {!subject ? <p className="rounded-md border border-dashed p-3 font-normal text-slate-500">Chọn môn học để hiện danh sách lớp.</p> : (
          <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-3">
            {classes.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 font-normal hover:bg-slate-50">
                <input type="checkbox" name="assignmentIds" value={c.id} checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
                {c.className}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
