/**
 * Thông báo nhỏ (toast) và hộp xác nhận dùng chung, thay cho alert/confirm của trình duyệt.
 * Là kho trạng thái thuần (không phụ thuộc React) nên gọi được từ bất kỳ đâu trong mã phía trình duyệt:
 *   toast.success("Đã lưu");  if (await confirmAction({ message: "Xoá lớp này?", tone: "danger" })) { ... }
 * Giao diện hiển thị nằm ở components/feedback-provider.tsx (đặt một lần ở layout gốc).
 */
export type ToastKind = "success" | "error" | "info" | "warning";
export type Toast = { id: number; kind: ToastKind; message: string; duration: number };
export type ConfirmOptions = { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; tone?: "danger" | "default" };
export type ConfirmRequest = Required<Omit<ConfirmOptions, "message">> & { id: number; message: string; resolve: (ok: boolean) => void };
export type FeedbackState = { toasts: Toast[]; confirm: ConfirmRequest | null };

export const MAX_TOASTS = 4;
const DURATION: Record<ToastKind, number> = { success: 4500, info: 5000, warning: 7000, error: 9000 };

const EMPTY: FeedbackState = { toasts: [], confirm: null };
let state: FeedbackState = EMPTY;
let nextId = 1;
const pending: ConfirmRequest[] = []; // hộp xác nhận xếp hàng: mỗi lúc chỉ hiện một hộp
const listeners = new Set<() => void>();
const set = (next: FeedbackState) => { state = next; listeners.forEach((l) => l()); };

export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getSnapshot = () => state;
export const getServerSnapshot = () => EMPTY;

function push(kind: ToastKind, message: string, duration?: number) {
  const text = message.trim();
  if (!text) return 0;
  // Cùng nội dung đang hiện thì không chồng thêm (bấm liên tục không tạo cả chục thông báo)
  if (state.toasts.some((t) => t.kind === kind && t.message === text)) return 0;
  const toast: Toast = { id: nextId++, kind, message: text, duration: duration ?? DURATION[kind] };
  set({ ...state, toasts: [...state.toasts, toast].slice(-MAX_TOASTS) });
  return toast.id;
}
export const toast = {
  success: (message: string, duration?: number) => push("success", message, duration),
  error: (message: string, duration?: number) => push("error", message, duration),
  info: (message: string, duration?: number) => push("info", message, duration),
  warning: (message: string, duration?: number) => push("warning", message, duration),
};
export const dismissToast = (id: number) => set({ ...state, toasts: state.toasts.filter((t) => t.id !== id) });

/** Hỏi xác nhận bằng hộp thoại riêng. Trả true nếu người dùng đồng ý, false nếu huỷ/đóng/nhấn Esc. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const tone = options.tone ?? "default";
    const req: ConfirmRequest = {
      id: nextId++, message: options.message, tone, resolve,
      title: options.title ?? (tone === "danger" ? "Xác nhận thao tác" : "Xác nhận"),
      confirmLabel: options.confirmLabel ?? (tone === "danger" ? "Đồng ý" : "Xác nhận"),
      cancelLabel: options.cancelLabel ?? "Huỷ",
    };
    if (state.confirm) pending.push(req); else set({ ...state, confirm: req });
  });
}
/** Gọi bởi giao diện khi người dùng chọn. Hộp kế tiếp trong hàng đợi (nếu có) hiện ra ngay sau đó. */
export function resolveConfirm(id: number, ok: boolean) {
  const current = state.confirm;
  if (!current || current.id !== id) return;
  current.resolve(ok);
  set({ ...state, confirm: pending.shift() ?? null });
}
/** Chỉ dành cho test. */
export function resetFeedback() { pending.length = 0; set(EMPTY); }
