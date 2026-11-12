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

/** Xáo trộn đề theo từng học sinh. Bài tạo mới mặc định bật; bài đã có giữ theo cài đặt hiện tại. */
export function ShuffleFields({ defaultQuestions = true, defaultOptions = true }: { defaultQuestions?: boolean; defaultOptions?: boolean }) {
  return (
    <div className="space-y-2 rounded-md border bg-slate-50/60 p-3">
      <div className="text-sm font-semibold">Xáo trộn đề theo từng học sinh</div>
      <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" name="shuffleQuestions" value="1" defaultChecked={defaultQuestions} className="mt-1" /><span>Xáo thứ tự <b>câu hỏi</b></span></label>
      <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" name="shuffleOptions" value="1" defaultChecked={defaultOptions} className="mt-1" /><span>Xáo thứ tự <b>đáp án</b> (A, B, C, D được đánh lại theo thứ tự mới)<br /><span className="text-xs font-normal text-slate-500">Học sinh tải lại trang vẫn thấy đúng thứ tự của mình. Câu có đáp án kiểu &quot;Cả A và B&quot; hoặc &quot;Tất cả các đáp án trên&quot; được giữ nguyên thứ tự đáp án.</span></span></label>
    </div>
  );
}

/** Số lần làm, cách tính điểm, giới hạn thời gian và cho xem lại bài sau khi hoàn thành. */
export function AttemptFields({ maxAttempts = 1, scoring = "BEST", timeLimit = 0, allowReview = true }: { maxAttempts?: number; scoring?: string; timeLimit?: number; allowReview?: boolean }) {
  return (
    <div className="space-y-3 rounded-md border bg-slate-50/60 p-3">
      <div className="text-sm font-semibold">Số lần làm và thời gian</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Số lần làm tối đa
          <input name="maxAttempts" defaultValue={maxAttempts} inputMode="numeric" className={inputCls + " w-full"} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Nếu làm nhiều lần
          <select name="attemptScoring" defaultValue={scoring} className={inputCls + " w-full"}><option value="BEST">Lấy điểm cao nhất</option><option value="LAST">Lấy điểm lần làm cuối</option></select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Thời gian làm bài (phút)
          <input name="timeLimitMinutes" defaultValue={timeLimit} inputMode="numeric" className={inputCls + " w-full"} />
        </label>
      </div>
      <p className="text-xs text-slate-500">Thời gian 0 = không giới hạn. Có giới hạn thì học sinh bấm &quot;Bắt đầu&quot;, đồng hồ đếm ngược và hết giờ tự nộp. Còn lượt làm lại thì chưa hiện đáp án đúng.</p>
      <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" name="allowReview" value="1" defaultChecked={allowReview} className="mt-1" /><span>Cho học sinh <b>xem lại bài làm</b> sau khi hoàn thành<br /><span className="text-xs font-normal text-slate-500">Bỏ tích: học sinh chỉ thấy điểm, không thấy từng câu.</span></span></label>
    </div>
  );
}
