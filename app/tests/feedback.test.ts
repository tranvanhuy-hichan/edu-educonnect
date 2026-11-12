import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { MAX_TOASTS, confirmAction, dismissToast, getServerSnapshot, getSnapshot, resetFeedback, resolveConfirm, subscribe, toast } from "../src/lib/feedback";

beforeEach(() => resetFeedback());

test("toasts stack, dedupe identical messages, cap the stack and can be dismissed", () => {
  const a = toast.success("Đã lưu");
  assert.ok(a);
  assert.equal(toast.success("Đã lưu"), 0, "cùng nội dung đang hiện thì không chồng thêm");
  assert.ok(toast.error("Đã lưu"), "khác loại thì vẫn hiện");
  for (let i = 0; i < 10; i++) toast.info(`Việc ${i}`);
  const state = getSnapshot();
  assert.equal(state.toasts.length, MAX_TOASTS);
  assert.equal(state.toasts[state.toasts.length - 1].message, "Việc 9", "giữ các thông báo mới nhất");
  dismissToast(state.toasts[0].id);
  assert.equal(getSnapshot().toasts.length, MAX_TOASTS - 1);
  assert.equal(toast.info("   "), 0, "nội dung rỗng bị bỏ qua");
  // lỗi tồn tại lâu hơn thành công để kịp đọc
  resetFeedback();
  toast.success("a"); toast.error("b");
  const [s, e] = getSnapshot().toasts;
  assert.ok(e.duration > s.duration);
});

test("confirm resolves true on agree, false on cancel, and queued requests are shown one at a time in order", async () => {
  const first = confirmAction({ message: "Xoá lớp?", tone: "danger", confirmLabel: "Xoá" });
  const second = confirmAction({ message: "Khoá tài khoản?" });
  let shown = getSnapshot().confirm!;
  assert.equal(shown.message, "Xoá lớp?");
  assert.equal(shown.confirmLabel, "Xoá");
  assert.equal(shown.tone, "danger");
  assert.equal(shown.cancelLabel, "Huỷ");
  resolveConfirm(shown.id, true);
  assert.equal(await first, true);
  shown = getSnapshot().confirm!;
  assert.equal(shown.message, "Khoá tài khoản?", "hộp thứ hai hiện sau khi hộp đầu xong");
  assert.equal(shown.tone, "default");
  resolveConfirm(shown.id, false);
  assert.equal(await second, false);
  assert.equal(getSnapshot().confirm, null);
  // trả lời sai mã hoặc trả lời hai lần không ảnh hưởng gì
  const third = confirmAction({ message: "x" });
  const id = getSnapshot().confirm!.id;
  resolveConfirm(id + 99, true);
  assert.notEqual(getSnapshot().confirm, null);
  resolveConfirm(id, false);
  resolveConfirm(id, true);
  assert.equal(await third, false);
});

test("subscribers are notified and the server snapshot stays empty for hydration", () => {
  let calls = 0;
  const off = subscribe(() => { calls++; });
  toast.warning("Cảnh báo");
  assert.equal(calls, 1);
  off();
  toast.info("Không ai nghe");
  assert.equal(calls, 1);
  assert.deepEqual(getServerSnapshot(), { toasts: [], confirm: null });
});
