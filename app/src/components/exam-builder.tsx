"use client";
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls } from "@/components/ui";
import type { ExamPlan } from "@/modules/exams/schema";
import type { ExamPreview } from "@/modules/exams/service";
import type { ExamFormData } from "@/modules/exams/queries";
import { draftExamIssues, draftReservations } from "@/modules/exams/draft-validation";
import { examDate, examTime, localExamTime, timeOverlap } from "@/modules/exams/planning";
import { previewExams, saveExams, checkExams, suggestExams } from "@/app/(app)/lich-thi/actions";

const button = "inline-flex items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50";
const primary = "inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50";
const steps = ["Khối & môn thi", "Giờ thi & phân phòng", "Kiểm tra & lưu"];

export function ExamBuilder({ data, initial, eventId }: { data: ExamFormData; initial?: ExamPlan; eventId?: string }) {
  const [plan, setPlan] = useState<ExamPlan>(initial ?? { title: "", category: "CUOI_KY", termId: data.terms.find((term) => term.current)?.id ?? data.terms[0]?.id ?? "", gradeId: data.grades[0]?.id ?? "", notes: "", papers: [] });
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState<ExamPreview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [error, setErrorState] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, startTransition] = useTransition();
  const [proctors, setProctors] = useState(1);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkTime, setBulkTime] = useState("08:00");
  const [gap, setGap] = useState(30);
  function setError(message: string) { setErrorState(message); if (message) requestAnimationFrame(() => document.getElementById("exam-feedback")?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  const rosterKey = JSON.stringify({ term: plan.termId, grade: plan.gradeId, papers: plan.papers.map((paper) => [paper.subjectId, paper.grouping, paper.maxPerRoom, paper.roomCount, paper.excludedStudentIds]) });
  const currentPreview = !!preview && previewKey === rosterKey;
  const finalPlan: ExamPlan = { ...plan, papers: plan.papers.map((paper) => ({ ...paper, allocations: preview?.papers.find((item) => item.subjectId === paper.subjectId)?.groups.map((group) => paper.allocations.find((allocation) => allocation.key === group.key) ?? { key: group.key, roomId: group.preferredRoomId, teacherIds: [] }) ?? paper.allocations })) };
  const reservations = preview ? draftReservations(finalPlan, preview) : [];
  const issues = preview ? draftExamIssues(finalPlan, preview, data.rooms) : [];
  const availableSubjects = data.subjects.filter((subject) => data.offerings.some((row) => row.termId === plan.termId && row.gradeId === plan.gradeId && row.subjectId === subject.id && row.count > 0));
  function editPaper(index: number, patch: Partial<ExamPlan["papers"][number]>) { setError(""); setNotice(""); setPlan((value) => ({ ...value, papers: value.papers.map((paper, i) => i === index ? { ...paper, ...patch } : paper) })); }
  function editAllocation(index: number, key: string, patch: Partial<ExamPlan["papers"][number]["allocations"][number]>) {
    setError(""); setNotice("");
    setPlan((value) => ({ ...value, papers: value.papers.map((paper, i) => i !== index ? paper : { ...paper, allocations: [...paper.allocations.filter((allocation) => allocation.key !== key), { key, roomId: null, teacherIds: [], ...(finalPlan.papers[i].allocations.find((allocation) => allocation.key === key)), ...patch }] }) }));
  }
  function payload() { const fd = new FormData(); fd.set("plan", JSON.stringify(finalPlan)); fd.set("id", eventId ?? ""); fd.set("fingerprint", preview?.fingerprint ?? ""); fd.set("proctors", String(proctors)); return fd; }
  function divide() {
    setError(""); setNotice(""); const key = rosterKey;
    startTransition(async () => {
      const result = await previewExams(null, payload());
      if (result?.error) { setError(result.error); return; }
      if (result?.data?.preview) { setPreview(JSON.parse(result.data.preview)); setPreviewKey(key); setStep(2); }
    });
  }
  function suggest() {
    setError(""); setNotice("");
    startTransition(async () => {
      const result = await suggestExams(null, payload());
      if (result?.error) setError(result.error);
      else if (result?.data?.plan) { setPlan(JSON.parse(result.data.plan)); setNotice(result.ok ?? "Đã gợi ý phân công"); }
    });
  }
  function review() {
    setError(""); setNotice("");
    if (!currentPreview) { setError("Danh sách đã đổi. Hãy chia phòng lại."); return; }
    if (issues.length) { setError(issues[0]); return; }
    startTransition(async () => { const result = await checkExams(null, payload()); if (result?.error) setError(result.error); else { setStep(3); setNotice(result?.ok ?? "Đã kiểm tra lịch thi"); } });
  }
  function fillTimes() {
    setError("");
    try {
      let next = examDate(`${bulkDate}T${bulkTime}`);
      setPlan({ ...plan, papers: plan.papers.map((paper) => { const startsAt = localExamTime(next); next = new Date(next.getTime() + (paper.durationMinutes + gap) * 60000); return { ...paper, startsAt }; }) });
    } catch { setError("Chọn ngày và giờ bắt đầu để điền các ca thi."); }
  }
  return <div className="space-y-4">
    <nav aria-label="Các bước tạo lịch thi" className="grid grid-cols-3 gap-2">{steps.map((label, i) => <button key={label} type="button" disabled={busy || i + 1 > step} onClick={() => { setStep(i + 1); setError(""); setNotice(""); }} aria-current={step === i + 1 ? "step" : undefined} className={`flex items-center gap-2 rounded-lg border p-3 text-left text-xs sm:text-sm ${step === i + 1 ? "border-orange-300 bg-orange-50 font-semibold text-orange-900" : "bg-white text-slate-500"}`}><span className="grid size-6 shrink-0 place-items-center rounded-full border">{i + 1 < step ? <Check className="size-3" /> : i + 1}</span>{label}</button>)}</nav>
    <div id="exam-feedback" className="scroll-mt-20" />
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {step === 1 && <form onSubmit={(event) => { event.preventDefault(); divide(); }}>
      <fieldset disabled={busy} className="space-y-4">
        <Card className="space-y-4">
          <h2 className="font-semibold">Kỳ thi dành cho khối nào?</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tên kỳ thi"><input required minLength={2} maxLength={200} value={plan.title} onChange={(event) => setPlan({ ...plan, title: event.target.value })} className={inputCls} placeholder="Ví dụ: Kiểm tra giữa kỳ I — Khối 11" /></Field>
            <Field label="Loại kỳ thi"><select value={plan.category} onChange={(event) => setPlan({ ...plan, category: event.target.value as ExamPlan["category"] })} className={inputCls}><option value="GIUA_KY">Giữa kỳ</option><option value="CUOI_KY">Cuối kỳ</option><option value="THI_LAI">Thi lại</option><option value="KHAC">Khác</option></select></Field>
            <Field label="Học kỳ"><select value={plan.termId} onChange={(event) => setPlan({ ...plan, termId: event.target.value, papers: [] })} className={inputCls}>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></Field>
            <Field label="Khối thi"><select value={plan.gradeId} onChange={(event) => setPlan({ ...plan, gradeId: event.target.value, papers: [] })} className={inputCls}>{data.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.label}</option>)}</select></Field>
          </div>
          <details><summary className="cursor-pointer text-sm text-slate-500">Thông báo thêm cho học sinh và giáo viên</summary><textarea value={plan.notes} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} rows={2} maxLength={3000} className="mt-2 w-full rounded-md border bg-white p-3 text-sm" /></details>
        </Card>
        <Card className="space-y-4">
          <h2 className="font-semibold">Chọn các môn thi</h2>
          <div className="flex flex-wrap gap-2">{availableSubjects.map((subject) => { const checked = plan.papers.some((paper) => paper.subjectId === subject.id); return <label key={subject.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${checked ? "border-orange-300 bg-orange-50 text-orange-900" : ""}`}><input type="checkbox" checked={checked} onChange={(event) => setPlan({ ...plan, papers: event.target.checked ? [...plan.papers, { subjectId: subject.id, grouping: "CLASS", maxPerRoom: null, roomCount: null, startsAt: "", durationMinutes: 45, reportMinutes: 15, excludedStudentIds: [], allocations: [] }] : plan.papers.filter((paper) => paper.subjectId !== subject.id) })} />{subject.label}</label>; })}</div>
          {!availableSubjects.length && <p className="text-sm text-slate-500">Khối này chưa có học sinh đã xếp lớp và được chọn môn học trong học kỳ.</p>}
          {plan.papers.map((paper, index) => <div key={paper.subjectId} className="grid items-end gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-3">
            <div><p className="mb-2 font-semibold">{data.subjects.find((subject) => subject.id === paper.subjectId)?.label}</p><select aria-label={`Cách chia môn ${index + 1}`} value={paper.grouping} onChange={(event) => editPaper(index, { grouping: event.target.value as "CLASS" | "ALPHABET", maxPerRoom: event.target.value === "ALPHABET" ? 24 : null, roomCount: null, allocations: [] })} className={inputCls + " w-full"}><option value="CLASS">Mỗi lớp một phòng thi</option><option value="ALPHABET">Trộn lớp và xếp theo tên alphabet</option></select></div>
            {paper.grouping === "ALPHABET" && <><Field label="Chia danh sách theo"><select value={paper.maxPerRoom !== null ? "max" : "count"} onChange={(event) => editPaper(index, event.target.value === "max" ? { maxPerRoom: 24, roomCount: null, allocations: [] } : { maxPerRoom: null, roomCount: 2, allocations: [] })} className={inputCls}><option value="max">Số học sinh tối đa mỗi phòng</option><option value="count">Số phòng muốn chia</option></select></Field><Field label={paper.maxPerRoom !== null ? "Tối đa học sinh/phòng — tự tính số phòng" : "Số phòng thi"}><input required type="number" min={1} max={paper.maxPerRoom !== null ? 500 : 200} value={paper.maxPerRoom ?? paper.roomCount ?? ""} onChange={(event) => editPaper(index, paper.maxPerRoom !== null ? { maxPerRoom: event.target.value ? Number(event.target.value) : null, roomCount: null, allocations: [] } : { roomCount: event.target.value ? Number(event.target.value) : null, allocations: [] })} className={inputCls} /></Field></>}
          </div>)}
        </Card>
        <div className="flex justify-end"><button disabled={!plan.papers.length || busy} className={primary}>{busy ? "Đang chia phòng..." : "Tiếp tục: giờ thi & phân phòng"}<ArrowRight className="size-4" /></button></div>
      </fieldset>
    </form>}
    {step === 2 && preview && <fieldset disabled={busy} className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold">{plan.title} · {preview.gradeName}</h2><p className="mt-1 text-sm text-slate-500">{preview.papers.length} môn · {preview.papers.reduce((sum, paper) => sum + paper.groups.length, 0)} lượt phòng. Chọn giờ thi rồi dùng gợi ý hoặc tự phân công.</p></div><button type="button" onClick={() => setStep(1)} className={button}>Đổi môn / cách chia</button></div>
        <details><summary className="cursor-pointer text-sm text-orange-700">Điền nhanh các ca thi liên tiếp trong một ngày</summary><div className="mt-3 grid items-end gap-3 sm:grid-cols-4"><Field label="Ngày thi"><input type="date" value={bulkDate} onChange={(event) => setBulkDate(event.target.value)} className={inputCls} /></Field><Field label="Giờ môn đầu"><input type="time" value={bulkTime} onChange={(event) => setBulkTime(event.target.value)} className={inputCls} /></Field><Field label="Nghỉ giữa hai môn (phút)"><input type="number" min={0} max={240} value={gap} onChange={(event) => setGap(Number(event.target.value))} className={inputCls} /></Field><button type="button" onClick={fillTimes} className={button}>Điền giờ các môn</button></div></details>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3"><select aria-label="Số giám thị gợi ý mỗi phòng" value={proctors} onChange={(event) => setProctors(Number(event.target.value))} className={inputCls}><option value={1}>1 giám thị/phòng</option><option value={2}>2 giám thị/phòng</option></select><button type="button" disabled={!currentPreview || plan.papers.some((paper) => !paper.startsAt)} onClick={suggest} className={button}><Sparkles className="size-4" />Gợi ý phòng & giám thị trống</button><span className="text-xs text-slate-500">{data.rooms.length} phòng học · {data.teachers.length} giáo viên</span></div>
      </Card>
      {!currentPreview && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Danh sách dự thi đã thay đổi.<button type="button" onClick={divide} className={button}>Chia lại danh sách</button></div>}
      {preview.papers.map((paper) => {
        const index = plan.papers.findIndex((item) => item.subjectId === paper.subjectId); if (index < 0) return null;
        const input = finalPlan.papers[index];
        return <Card key={paper.subjectId} className="space-y-4">
          <h3 className="font-semibold">{paper.subjectName} <span className="ml-2 text-xs font-normal text-slate-500">{paper.candidateCount} học sinh · {paper.groups.length} phòng thi</span></h3>
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Ngày, giờ bắt đầu (giờ Việt Nam)"><input type="datetime-local" value={input.startsAt} onChange={(event) => editPaper(index, { startsAt: event.target.value })} className={inputCls} /></Field><Field label="Làm bài (phút)"><input type="number" min={5} max={360} value={input.durationMinutes} onChange={(event) => editPaper(index, { durationMinutes: Number(event.target.value) })} className={inputCls} /></Field><Field label="Có mặt trước giờ thi (phút)"><input type="number" min={0} max={120} value={input.reportMinutes} onChange={(event) => editPaper(index, { reportMinutes: Number(event.target.value) })} className={inputCls} /></Field></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="min-w-32 p-2">Nhóm thi</th><th className="min-w-40 p-2">Phòng học</th><th className="min-w-44 p-2">Giám thị 1</th><th className="min-w-44 p-2">Giám thị 2 (tùy chọn)</th></tr></thead><tbody>{paper.groups.map((group) => {
            const allocation = input.allocations.find((row) => row.key === group.key)!;
            const key = `${paper.subjectId}/${group.key}`;
            const current = reservations.find((row) => row.key === key);
            const others = current ? reservations.filter((row) => row.key !== key && timeOverlap(row, current)) : [];
            return <tr key={group.key} className="border-b"><td className="p-2 font-medium">{group.label}<div className="text-xs font-normal text-slate-500">{group.candidates.length} thí sinh</div></td><td className="p-2"><select aria-label={`Phòng học ${paper.subjectName} ${group.label}`} value={allocation.roomId ?? ""} onChange={(event) => editAllocation(index, group.key, { roomId: event.target.value || null })} className={inputCls + " w-full"}><option value="">Chọn phòng</option>{data.rooms.map((room) => { const occupied = others.some((row) => row.roomId === room.id); return <option key={room.id} value={room.id} disabled={room.capacity < group.candidates.length || occupied}>{room.label} · {room.capacity} chỗ{occupied ? " · trùng ca" : ""}</option>; })}</select></td>{[0, 1].map((position) => <td key={position} className="p-2"><select aria-label={`Giám thị ${position + 1} ${paper.subjectName} ${group.label}`} value={allocation.teacherIds[position] ?? ""} onChange={(event) => { const ids = [...allocation.teacherIds]; ids[position] = event.target.value; editAllocation(index, group.key, { teacherIds: ids.filter(Boolean) }); }} className={inputCls + " w-full"}><option value="">Chọn giáo viên</option>{data.teachers.map((teacher) => { const occupied = others.some((row) => row.teachers.includes(teacher.id)); const duplicate = allocation.teacherIds.includes(teacher.id) && allocation.teacherIds[position] !== teacher.id; return <option key={teacher.id} value={teacher.id} disabled={occupied || duplicate}>{teacher.label}{occupied ? " · trùng ca" : ""}</option>; })}</select></td>)}</tr>;
          })}</tbody></table></div>
          <details><summary className="cursor-pointer text-sm text-orange-700">Xem danh sách / loại trừ học sinh dự thi</summary><p className="mt-2 text-xs text-slate-500">Bỏ chọn học sinh không dự thi rồi chia lại danh sách.</p>{input.excludedStudentIds.length > 0 && <button type="button" onClick={() => editPaper(index, { excludedStudentIds: [] })} className="mt-2 text-xs text-orange-700 underline">Khôi phục {input.excludedStudentIds.length} học sinh đã loại</button>}<div className="mt-2 max-h-72 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="p-2">Dự thi</th><th>SBD</th><th>Họ tên</th><th>Lớp</th><th>Nhóm thi</th></tr></thead><tbody>{paper.groups.flatMap((group) => group.candidates.map((candidate) => <tr key={candidate.id} className="border-b"><td className="p-2"><input type="checkbox" aria-label={`Cho ${candidate.fullName} dự thi`} checked={!input.excludedStudentIds.includes(candidate.id)} onChange={(event) => editPaper(index, { excludedStudentIds: event.target.checked ? input.excludedStudentIds.filter((id) => id !== candidate.id) : [...input.excludedStudentIds, candidate.id] })} /></td><td>{candidate.registrationNo}</td><td>{candidate.fullName}</td><td>{candidate.className}</td><td>{group.label}</td></tr>))}</tbody></table></div></details>
        </Card>;
      })}
      {currentPreview && issues.length > 0 && <details className="rounded-lg border bg-white p-3 text-sm"><summary className="cursor-pointer text-amber-700">Còn {issues.length} mục cần hoàn thiện hoặc xử lý xung đột</summary><ul className="mt-2 list-inside list-disc space-y-1 text-red-600">{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details>}
      <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={() => setStep(1)} className={button}><ArrowLeft className="size-4" />Quay lại</button><button type="button" onClick={review} disabled={busy || !currentPreview} className={primary}>{busy ? "Đang kiểm tra..." : "Kiểm tra lịch & tiếp tục"}<ArrowRight className="size-4" /></button></div>
    </fieldset>}
    {step === 3 && preview && <div className="space-y-4">
      <Card className="space-y-3"><h2 className="font-semibold">{plan.title}</h2><p className="text-sm text-slate-500">{preview.gradeName} · {preview.termName}</p>{preview.papers.map((paper) => { const input = finalPlan.papers.find((row) => row.subjectId === paper.subjectId)!; return <div key={paper.subjectId} className="rounded-lg border p-3"><p className="font-semibold">{paper.subjectName} · {paper.candidateCount} học sinh</p><p className="my-2 text-sm">{examTime(examDate(input.startsAt))} · {input.durationMinutes} phút · Có mặt trước {input.reportMinutes} phút</p><ul className="space-y-1 text-sm text-slate-600">{paper.groups.map((group) => { const allocation = input.allocations.find((row) => row.key === group.key)!; return <li key={group.key}>{group.label} → <b>{data.rooms.find((room) => room.id === allocation.roomId)?.label}</b> · {allocation.teacherIds.map((id) => data.teachers.find((teacher) => teacher.id === id)?.label).join(" / ")}</li>; })}</ul></div>; })}</Card>
      <Card><ActionForm action={saveExams} submit={eventId ? "Lưu thay đổi bản nháp" : "Tạo lịch thi — lưu bản nháp"} reset={false} className="flex flex-col gap-3"><input type="hidden" name="id" value={eventId ?? ""} /><input type="hidden" name="plan" value={JSON.stringify(finalPlan)} /><input type="hidden" name="fingerprint" value={preview.fingerprint} /><p className="text-sm text-slate-500">Hệ thống kiểm tra trùng lần nữa khi lưu. Bạn có thể công bố sau khi duyệt bản nháp.</p></ActionForm></Card>
      <button type="button" onClick={() => setStep(2)} className={button}><ArrowLeft className="size-4" />Quay lại phân phòng</button>
    </div>}
  </div>;
}
