"use client";
import { useEffect, useRef, useState } from "react";
import { downloadCsv } from "@/lib/credentials-csv";
import { confirmAction } from "@/lib/feedback";

type Option = { value: string; label: string };
type Row = { fullName: string; username: string; className: string; roles: string; password: string };
type Preview = { ids: string[]; total: number; students: number; staff: number };
type Fail = { ok: false; error: string };
type Props = {
  roles: Option[];
  classes: Option[];
  batchSize: number;
  preview: (input: { roles: string[]; classIds: string[]; allClasses: boolean }) => Promise<({ ok: true } & Preview) | Fail>;
  run: (ids: string[]) => Promise<{ ok: true; rows: Row[] } | Fail>;
};

const csvOf = (rows: Row[]) => downloadCsv(["Họ tên", "Tài khoản đăng nhập", "Lớp", "Vai trò", "Mật khẩu tạm"], rows.map((r) => [r.fullName, r.username, r.className, r.roles, r.password]), "cap-lai-mat-khau");

/**
 * Chọn nhóm (vai trò, lớp hoặc tất cả lớp) → xem trước số tài khoản → cấp lại theo từng lô nhỏ → tải CSV.
 * Mật khẩu chỉ nằm trong bộ nhớ trình duyệt này, không lưu ở đâu khác: đóng hộp thoại là mất, nên CSV tự tải ngay khi xong.
 */
export function BulkResetPasswords({ roles, classes, batchSize, preview, run }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allClasses, setAllClasses] = useState(true);
  const [classIds, setClassIds] = useState<Set<string>>(new Set());
  const [found, setFound] = useState<Preview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (running.current) e.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); setter(n); setFound(null); setError(""); };
  const student = picked.has("STUDENT");

  async function doPreview() {
    setBusy(true); setError(""); setFound(null);
    const r = await preview({ roles: [...picked], classIds: student && !allClasses ? [...classIds] : [], allClasses: student ? allClasses : false });
    setBusy(false);
    if (!r.ok) setError(r.error); else setFound(r);
  }

  async function doRun() {
    if (!found) return;
    const go = await confirmAction({ title: `Cấp lại mật khẩu cho ${found.total} tài khoản?`, message: "Mật khẩu cũ sẽ không dùng được nữa và mọi người bị đăng xuất khỏi các thiết bị. Mật khẩu mới chỉ hiện trong file CSV tải về ngay sau đó.", confirmLabel: "Cấp lại mật khẩu", tone: "danger" });
    if (!go) return;
    running.current = true; setPhase("running"); setError(""); setRows([]);
    const done: Row[] = [];
    for (let i = 0; i < found.ids.length; i += batchSize) {
      const r = await run(found.ids.slice(i, i + batchSize));
      if (!r.ok) { setError(`${r.error}. Đã cấp lại ${done.length}/${found.total} tài khoản, hãy tải CSV phần đã xong rồi xem trước lại để làm tiếp.`); break; }
      done.push(...r.rows); setRows([...done]);
    }
    running.current = false;
    setPhase("done");
    if (done.length) csvOf(done);
  }

  if (phase !== "form") {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium">{phase === "running" ? "Đang cấp lại mật khẩu... đừng đóng trang." : "Hoàn tất."} Đã xử lý {rows.length}/{found?.total ?? 0} tài khoản.</p>
        <div className="h-2 overflow-hidden rounded bg-slate-200"><div className="h-full bg-orange-600 transition-all" style={{ width: `${found?.total ? (rows.length / found.total) * 100 : 0}%` }} /></div>
        {error && <p className="rounded-md border border-red-300 bg-red-50 p-2 text-red-700" role="alert">{error}</p>}
        {phase === "done" && (
          <>
            <p className="text-slate-600">File CSV đã tự tải về. Mật khẩu chỉ hiện ở đây một lần, hãy cất file cẩn thận và gửi riêng cho từng người. Khi đăng nhập họ sẽ bị buộc đổi mật khẩu ngay.</p>
            <div className="flex gap-2">
              {rows.length > 0 && <button type="button" onClick={() => csvOf(rows)} className="h-9 rounded-md border bg-white px-4 font-medium hover:bg-slate-50">Tải lại CSV</button>}
              <button type="button" onClick={() => { setPhase("form"); setFound(null); setRows([]); setError(""); }} className="h-9 rounded-md border bg-white px-4 font-medium hover:bg-slate-50">Làm nhóm khác</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-slate-600">Cấp mật khẩu mới ngẫu nhiên cho từng tài khoản trong nhóm đã chọn và tải CSV. Tài khoản đang khoá và tài khoản của bạn được bỏ qua. Người dùng phải đổi mật khẩu ngay khi đăng nhập.</p>
      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">Nhóm tài khoản</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {roles.map((r) => <label key={r.value} className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={picked.has(r.value)} onChange={() => toggle(picked, setPicked, r.value)} />{r.label}</label>)}
        </div>
      </fieldset>
      {student && (
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 font-medium">Lớp của học sinh</legend>
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={allClasses} onChange={() => { setAllClasses(!allClasses); setFound(null); setError(""); }} />Tất cả lớp</label>
          {!allClasses && (
            <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {classes.map((c) => <label key={c.value} className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={classIds.has(c.value)} onChange={() => toggle(classIds, setClassIds, c.value)} />{c.label}</label>)}
              {!classes.length && <p className="col-span-full text-slate-500">Chưa có lớp nào trong năm học hiện hành.</p>}
            </div>
          )}
        </fieldset>
      )}
      {error && <p className="rounded-md border border-red-300 bg-red-50 p-2 text-red-700" role="alert">{error}</p>}
      {found && (
        <p className="rounded-md border border-orange-300 bg-orange-50 p-3">
          Sẽ cấp lại mật khẩu cho <b>{found.total}</b> tài khoản ({found.students} học sinh, {found.staff} giáo viên/nhân sự).
          {found.total === 0 && " Không có tài khoản nào phù hợp."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !picked.size} onClick={doPreview} className="h-9 rounded-md border bg-white px-4 font-medium hover:bg-slate-50 disabled:opacity-50">{busy ? "Đang kiểm tra..." : "Xem trước số tài khoản"}</button>
        <button type="button" disabled={!found || found.total === 0} onClick={doRun} className="h-9 rounded-md bg-coral-600 px-4 font-medium text-white hover:bg-coral-700 disabled:opacity-50">Cấp lại mật khẩu & tải CSV</button>
      </div>
    </div>
  );
}
