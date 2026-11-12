import { inputCls } from "@/components/ui";

/** Cài đặt "thi nghiêm túc" cho bài trắc nghiệm: toàn màn hình, viền đỏ, ghi nhận vi phạm, tự nộp khi vượt giới hạn. */
export function SecureModeFields({ defaultSecure = false, defaultMax = 3 }: { defaultSecure?: boolean; defaultMax?: number }) {
  return (
    <div className="space-y-2 rounded-md border border-red-200 bg-red-50/40 p-3">
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" name="secureMode" value="1" defaultChecked={defaultSecure} className="mt-1" />
        <span><b>Chế độ thi nghiêm túc</b><br /><span className="text-xs font-normal text-slate-600">Học sinh làm bài toàn màn hình, viền đỏ. Thoát toàn màn hình, chuyển tab hoặc sang ứng dụng khác (cả điện thoại), rời cửa sổ, đưa chuột ra ngoài đều bị ghi nhận là vi phạm.</span></span>
      </label>
      <label className="flex flex-wrap items-center gap-2 pl-6 text-sm">
        Tự động nộp bài sau
        <input name="maxViolations" defaultValue={defaultMax} inputMode="numeric" aria-label="Số lần vi phạm tối đa" className={inputCls + " h-8 w-16 text-center"} />
        lần vi phạm <span className="text-xs text-slate-500">(0 = chỉ ghi nhận, không tự nộp)</span>
      </label>
    </div>
  );
}
