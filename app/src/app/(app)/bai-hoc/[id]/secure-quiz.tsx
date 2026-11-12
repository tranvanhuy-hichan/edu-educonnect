"use client";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Clock, Maximize, ShieldAlert } from "lucide-react";
import type { Res } from "@/lib/action";

type Report = (exerciseId: string, type: string, detail?: string, answers?: FormData) => Promise<{ count: number; max: number; exceeded: boolean } | { error: string }>;
type Start = (exerciseId: string) => Promise<{ attemptNo: number; startedAt: string; serverNow: string; timeLimitMinutes: number } | { error: string }>;
const LABEL: Record<string, string> = {
  EXIT_FULLSCREEN: "Thoát chế độ toàn màn hình", TAB_SWITCH: "Chuyển tab hoặc sang ứng dụng khác", WINDOW_BLUR: "Rời khỏi cửa sổ làm bài", MOUSE_LEAVE: "Đưa chuột ra ngoài màn hình thi",
};
const DEBOUNCE_MS = 1200;

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const fsElement = () => (document as FsDoc).fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;
const fsSupported = () => typeof document !== "undefined" && !!((document.documentElement as FsEl).requestFullscreen || (document.documentElement as FsEl).webkitRequestFullscreen);
const enterFs = () => { const el = document.documentElement as FsEl; return (el.requestFullscreen ? el.requestFullscreen({ navigationUI: "hide" }) : el.webkitRequestFullscreen?.()) ?? Promise.resolve(); };
const leaveFs = () => { const d = document as FsDoc; if (fsElement()) void (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.())?.catch(() => undefined); };
const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(r).padStart(2, "0")}`; };

/**
 * Làm bài kiểm tra có giờ làm bài và/hoặc thi nghiêm túc.
 * - Bấm "Bắt đầu": máy chủ ghi giờ bắt đầu (vào lại giữa chừng thì đồng hồ KHÔNG đặt lại), hết giờ tự nộp.
 * - Thi nghiêm túc: toàn màn hình, viền đỏ, ghi nhận vi phạm, vượt giới hạn thì tự nộp.
 * Lưu ý: trình duyệt không cho chặn hẳn việc thoát, nên đây là ghi nhận và răn đe; giáo viên xem được từng vi phạm.
 */
export function ExamRunner({ exerciseId, title, count: questionCount, secure, maxViolations, priorViolations, timeLimitMinutes, attemptNo, maxAttempts, report, start, action, children }: {
  exerciseId: string; title: string; count: number; secure: boolean; maxViolations: number; priorViolations: number; timeLimitMinutes: number; attemptNo: number; maxAttempts: number;
  report: Report; start: Start; action: (p: Res, fd: FormData) => Promise<Res>; children: React.ReactNode;
}) {
  const [phase, setPhase] = useState<"intro" | "active">("intro");
  const [violations, setViolations] = useState(priorViolations);
  const [notice, setNotice] = useState("");
  const [needFs, setNeedFs] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [startError, setStartError] = useState("");
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [finished, setFinished] = useState(false); // dùng để vẽ giao diện; `ended` (ref) dùng cho bộ lắng nghe sự kiện
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const formRef = useRef<HTMLFormElement>(null);
  const autoRef = useRef<HTMLInputElement>(null);
  const ended = useRef(false);
  const last = useRef(0);
  const supportsFs = useRef(false);
  // nộp lỗi: tiếp tục giám sát/đếm giờ để em còn làm tiếp
  const [res, formAction, pending] = useActionState(async (prev: Res, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.error) { ended.current = false; setFinished(false); setAutoSubmitted(false); setTimeUp(false); }
    return r;
  }, null);

  const flag = useCallback(async (type: string) => {
    if (ended.current) return;
    const t = Date.now();
    if (t - last.current < DEBOUNCE_MS) return; // một thao tác thường kích hoạt nhiều sự kiện trình duyệt
    last.current = t;
    setNotice(`Đang ghi nhận vi phạm: ${LABEL[type] ?? type}`);
    const r = await report(exerciseId, type, LABEL[type], formRef.current ? new FormData(formRef.current) : undefined);
    if ("error" in r) { setNotice(`Vi phạm: ${LABEL[type] ?? type}`); return; }
    setViolations(r.count);
    setNotice(`Vi phạm lần ${r.count}${r.max ? `/${r.max}` : ""}: ${LABEL[type] ?? type}.${r.exceeded ? " Bài của em được nộp tự động." : r.max ? " Vượt giới hạn bài sẽ bị nộp tự động." : ""}`);
    if (r.exceeded) { ended.current = true; setFinished(true); setAutoSubmitted(true); setConfirming(false); leaveFs(); window.location.reload(); }
  }, [exerciseId, report]);

  async function begin() {
    setStartError("");
    supportsFs.current = secure && fsSupported();
    if (supportsFs.current) {
      try { await enterFs(); } catch { setStartError("Trình duyệt không cho phép vào toàn màn hình. Hãy cho phép rồi bấm lại."); return; }
    }
    const r = await start(exerciseId);
    if ("error" in r) { leaveFs(); setStartError(r.error); return; }
    if (timeLimitMinutes > 0) {
      const skew = new Date(r.serverNow).getTime() - Date.now(); // đồng hồ máy học sinh có thể lệch: tính theo giờ máy chủ
      setDeadline(new Date(r.startedAt).getTime() + timeLimitMinutes * 60_000 - skew);
    }
    last.current = Date.now(); // vào toàn màn hình có thể kích hoạt blur ngay: bỏ qua
    setNow(Date.now());
    setPhase("active");
  }

  // đồng hồ đếm ngược: hết giờ thì tự nộp
  useEffect(() => {
    if (phase !== "active" || deadline == null) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= deadline && !ended.current) {
        ended.current = true;
        setFinished(true);
        setTimeUp(true);
        setConfirming(false);
        formRef.current?.requestSubmit();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, deadline]);

  useEffect(() => {
    if (phase !== "active") return;
    document.body.style.overflow = "hidden"; // khóa cuộn trang phía sau
    if (!secure) return () => { document.body.style.overflow = ""; };
    const onVisibility = () => { if (document.hidden) void flag("TAB_SWITCH"); };
    const onBlur = () => { if (!document.hidden) void flag("WINDOW_BLUR"); };
    const onFs = () => { if (supportsFs.current && !fsElement() && !ended.current) { setNeedFs(true); void flag("EXIT_FULLSCREEN"); } else if (fsElement()) setNeedFs(false); };
    const onLeave = (e: MouseEvent) => { if (window.matchMedia("(pointer: fine)").matches && (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight)) void flag("MOUSE_LEAVE"); };
    const block = (e: Event) => e.preventDefault();
    const beforeUnload = (e: BeforeUnloadEvent) => { if (!ended.current) e.preventDefault(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    document.documentElement.addEventListener("mouseleave", onLeave);
    for (const ev of ["contextmenu", "copy", "cut", "paste", "dragstart"]) document.addEventListener(ev, block);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      for (const ev of ["contextmenu", "copy", "cut", "paste", "dragstart"]) document.removeEventListener(ev, block);
      window.removeEventListener("beforeunload", beforeUnload);
      document.body.style.overflow = "";
      leaveFs(); // trang chuyển sang kết quả => component bị gỡ => thoát toàn màn hình
    };
  }, [phase, flag, secure]);

  if (phase === "intro") {
    const tone = secure ? "border-red-300" : "border-slate-300";
    return (
      <div className={`mx-auto max-w-2xl space-y-4 rounded-xl border-2 ${tone} bg-white p-5 sm:p-6`}>
        <div className="flex items-center gap-3"><span className={`grid size-11 place-items-center rounded-xl ${secure ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"}`}>{secure ? <ShieldAlert className="size-6" /> : <Clock className="size-6" />}</span><div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-slate-600">{secure ? "Bài kiểm tra nghiêm túc" : "Bài kiểm tra có giờ làm bài"} · {questionCount} câu{maxAttempts > 1 ? ` · Lượt ${attemptNo}/${maxAttempts}` : ""}</p></div></div>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          {timeLimitMinutes > 0 && <li>Thời gian làm bài: <b>{timeLimitMinutes} phút</b>. Đồng hồ bắt đầu chạy khi em bấm &quot;Bắt đầu&quot; và <b>không dừng lại</b> kể cả khi em thoát ra vào lại. Hết giờ bài được <b>nộp tự động</b>.</li>}
          {secure && <>
            <li>Bài làm ở chế độ <b>toàn màn hình</b>, viền màn hình màu <b className="text-red-600">đỏ</b> trong suốt thời gian làm bài.</li>
            <li>Các hành vi sau bị ghi nhận là <b>vi phạm</b>: thoát toàn màn hình, chuyển tab hoặc sang ứng dụng khác (kể cả trên điện thoại), rời khỏi cửa sổ, đưa chuột ra ngoài màn hình thi.</li>
            <li>{maxViolations > 0 ? <>Vi phạm <b>{maxViolations} lần</b> thì bài của em được <b>nộp tự động</b>.</> : <>Mọi vi phạm được ghi lại và giáo viên sẽ xem.</>}</li>
            <li>Không sao chép, dán hay mở menu chuột phải trong lúc làm bài.</li>
          </>}
          <li>{maxAttempts > 1 ? <>Em có tối đa <b>{maxAttempts} lượt</b> làm bài; đây là lượt <b>{attemptNo}</b>.</> : <>Em chỉ được làm bài <b>một lần</b>.</>}</li>
        </ul>
        {secure && priorViolations > 0 && <p className="rounded-md bg-red-50 p-2.5 text-sm text-red-700">Em đã có {priorViolations} vi phạm ở lần vào làm trước.</p>}
        {secure && !fsSupported() && <p className="rounded-md bg-yellow-50 p-2.5 text-xs text-yellow-800">Thiết bị này không hỗ trợ toàn màn hình (ví dụ iPhone). Em vẫn bị ghi nhận khi chuyển tab hoặc sang ứng dụng khác.</p>}
        {startError && <p className="text-sm text-red-600">{startError}</p>}
        <button type="button" onClick={begin} className={`inline-flex h-11 items-center gap-2 rounded-lg px-6 text-sm font-semibold text-white max-sm:w-full max-sm:justify-center ${secure ? "bg-red-600 hover:bg-red-700" : "bg-slate-800 hover:bg-slate-900"}`}>{secure ? <Maximize className="size-4" /> : <Clock className="size-4" />}Bắt đầu làm bài{secure ? " (toàn màn hình)" : ""}</button>
      </div>
    );
  }

  const left = deadline != null ? deadline - now : null;
  // Đưa ra ngoài cùng của trang (portal) để phủ kín cả thanh menu/đầu trang, nếu không viền đỏ và thanh cảnh báo bị che
  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto" style={{ background: "var(--bg)" }}>
      {secure && <div aria-hidden className="pointer-events-none fixed inset-0 z-[130]" style={{ boxShadow: "inset 0 0 0 6px #dc2626" }} />}
      <div className={`sticky top-0 z-[120] flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm font-semibold text-white ${secure ? "bg-red-600" : "bg-slate-800"}`}>
        <span className="inline-flex items-center gap-2">{secure ? <ShieldAlert className="size-4" /> : <Clock className="size-4" />}ĐANG LÀM BÀI KIỂM TRA{maxAttempts > 1 ? ` · Lượt ${attemptNo}/${maxAttempts}` : ""}</span>
        <span className="inline-flex items-center gap-4">
          {left != null && <span className={`inline-flex items-center gap-1.5 tabular-nums ${left < 60_000 ? "animate-pulse rounded bg-white px-2 text-red-700" : ""}`}><Clock className="size-4" />Còn {clock(left)}</span>}
          {secure && <span>Vi phạm: {violations}{maxViolations ? `/${maxViolations}` : ""}</span>}
        </span>
      </div>
      {notice && <div role="alert" className="sticky top-[36px] z-[120] flex items-start gap-2 bg-yellow-300 px-4 py-2 text-sm font-medium text-slate-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{notice}</span></div>}
      <form ref={formRef} action={formAction} className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-28">
        <input type="hidden" name="exerciseId" value={exerciseId} />
        <input ref={autoRef} type="hidden" name="autoSubmitted" defaultValue="0" />
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
        {res?.error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{res.error}</p>}
        <div className="fixed inset-x-0 bottom-0 z-[120] flex items-center justify-between gap-3 border-t bg-white px-4 py-3" style={{ background: "var(--surface)" }}>
          <span className="text-xs text-slate-500">{maxAttempts > 1 ? `Lượt ${attemptNo}/${maxAttempts}.` : "Em chỉ được nộp một lần."}</span>
          <button type="button" disabled={pending} onClick={() => setConfirming(true)} className="h-10 rounded-md bg-coral-600 px-6 text-sm font-semibold text-white hover:bg-coral-700 disabled:opacity-50">{pending ? "Đang nộp..." : "Nộp bài"}</button>
        </div>
      </form>

      {confirming && !pending && (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-xl p-5 shadow-2xl" style={{ background: "var(--surface)" }}>
            <h3 className="text-base font-semibold">Nộp bài?</h3>
            <p className="text-sm text-slate-600">{maxAttempts > 1 ? "Nộp xong lượt này không sửa được." : "Em chỉ được làm bài một lần. Nộp xong không sửa được."}</p>
            <div className="flex gap-2"><button type="button" onClick={() => setConfirming(false)} className="h-10 flex-1 rounded-md border text-sm font-medium">Làm tiếp</button><button type="button" onClick={() => { ended.current = true; setFinished(true); setConfirming(false); formRef.current?.requestSubmit(); }} className="h-10 flex-1 rounded-md bg-coral-600 text-sm font-semibold text-white">Nộp bài</button></div>
          </div>
        </div>
      )}

      {timeUp && (
        <div role="alert" className="fixed inset-0 z-[160] grid place-items-center bg-slate-900 p-6 text-center text-white">
          <div className="max-w-md space-y-4"><Clock className="mx-auto size-16" /><h3 className="text-2xl font-bold">Hết giờ làm bài</h3><p className="text-base">Bài làm của em đã được nộp tự động tại thời điểm hết giờ.</p><p className="text-sm opacity-90">{pending ? "Đang nộp bài..." : "Đang chuyển tới kết quả..."}</p></div>
        </div>
      )}
      {autoSubmitted && (
        <div role="alert" className="fixed inset-0 z-[160] grid place-items-center bg-red-700 p-6 text-center text-white">
          <div className="max-w-md space-y-4">
            <ShieldAlert className="mx-auto size-16" />
            <h3 className="text-2xl font-bold">Bài của em đã bị nộp tự động</h3>
            <p className="text-base">Em đã vi phạm quy chế thi {violations}{maxViolations ? `/${maxViolations}` : ""} lần (thoát toàn màn hình, chuyển tab hoặc sang ứng dụng khác...). Hệ thống đã nộp bài làm hiện tại của em và thông báo cho giáo viên.</p>
            <p className="text-sm opacity-90">{pending ? "Đang nộp bài..." : "Đang chuyển tới kết quả..."}</p>
          </div>
        </div>
      )}
      {needFs && !finished && (
        <div className="fixed inset-0 z-[150] grid place-items-center bg-red-700/95 p-6 text-center text-white">
          <div className="max-w-md space-y-4">
            <ShieldAlert className="mx-auto size-14" />
            <h3 className="text-xl font-bold">Em đã thoát khỏi chế độ toàn màn hình</h3>
            <p className="text-sm">Hành vi này đã được ghi nhận là vi phạm ({violations}{maxViolations ? `/${maxViolations}` : ""}). Hãy quay lại toàn màn hình để tiếp tục làm bài.</p>
            <button type="button" onClick={() => { void enterFs().then(() => setNeedFs(false)).catch(() => undefined); }} className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-6 text-sm font-semibold text-red-700"><Maximize className="size-4" />Quay lại toàn màn hình</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
