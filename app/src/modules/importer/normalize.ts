import { parseNumber } from "@/modules/question/question.grading";
import type { ExtractedQuestion } from "./extractor";

export type NormalizedOption = { content: string; isCorrect: boolean; imageRefs: number[] };
export type NormalizedQuestion = {
  type: ExtractedQuestion["type"];
  content: string;
  imageRefs: number[];
  options: NormalizedOption[];
  answerKey: { mode: "NUMBER" | "TEXT"; answers: string[]; tolerance: number } | null;
  explanation: string | null;
  difficulty: ExtractedQuestion["difficulty"];
  topic: string | null;
  points: number;
  reviewStatus: "READY" | "NEEDS_REVIEW";
  reviewNote: string | null;
};

const stripMarkers = (s: string) => s.replace(/\[\[IMG:\d+\]\]/g, "").trim();

/**
 * Đưa một câu AI trích xuất về dạng lưu được, lenient hơn questionInputSchema:
 * câu có vấn đề vẫn được giữ nhưng đánh dấu NEEDS_REVIEW kèm lý do để giáo viên duyệt.
 * Trả null nếu câu rỗng hoàn toàn (không có chữ lẫn ảnh).
 */
export function normalizeQuestion(q: ExtractedQuestion, availableImages: ReadonlySet<number>): NormalizedQuestion | null {
  const content = stripMarkers(q.content).slice(0, 10000);
  const imageRefs = q.imageRefs.filter((n) => availableImages.has(n));
  if (!content && !imageRefs.length) return null;

  const reasons: string[] = [];
  let options: NormalizedOption[] = [];
  let answerKey: NormalizedQuestion["answerKey"] = null;

  if (q.type === "SHORT_ANSWER") {
    let mode = q.answerKey.mode;
    const answers = q.answerKey.answers.slice(0, 10).map((a) => a.slice(0, 200));
    if (mode === "NUMBER" && answers.some((a) => !Number.isFinite(parseNumber(a)))) {
      mode = "TEXT";
      reasons.push("Đáp án có chữ nên được chuyển sang kiểu chữ, hãy kiểm tra lại");
    }
    if (!answers.length) reasons.push("Chưa có đáp án đúng");
    answerKey = { mode, answers, tolerance: mode === "NUMBER" ? q.answerKey.tolerance : 0 };
  } else {
    options = q.options
      .map((o) => ({ content: stripMarkers(o.content).slice(0, 2000), isCorrect: o.isCorrect, imageRefs: o.imageRefs.filter((n) => availableImages.has(n)).slice(0, 1) }))
      .filter((o) => o.content || o.imageRefs.length)
      .slice(0, q.type === "TRUE_FALSE_GROUP" ? 4 : 6);
    if (q.type === "SINGLE_CHOICE") {
      if (options.length < 2) reasons.push("Chưa đủ 2 đáp án");
      const correct = options.filter((o) => o.isCorrect).length;
      if (correct === 0) reasons.push("Chưa xác định được đáp án đúng");
      if (correct > 1) {
        reasons.push("Có nhiều hơn một đáp án đúng, chỉ giữ đáp án đầu tiên");
        let seen = false;
        options = options.map((o) => (o.isCorrect && !seen ? ((seen = true), o) : { ...o, isCorrect: false }));
      }
    } else if (options.length !== 4) reasons.push(`Câu Đúng/Sai cần đúng 4 ý, tìm được ${options.length} ý`);
  }

  if (q.answerSource === "AI_SOLVED") reasons.push("Tài liệu không có đáp án, AI tự giải nên cần kiểm tra lại");
  else if (q.answerSource === "UNKNOWN") reasons.push("Không tìm thấy đáp án trong tài liệu");
  if (q.needsFigure) reasons.push("Câu có hình vẽ/đồ thị nhưng chưa trích được ảnh, cần thêm ảnh thủ công");
  if (q.confidence < 0.7) reasons.push("AI không chắc chắn về câu này");
  if (q.note) reasons.push(q.note);

  return {
    type: q.type, content, imageRefs, options, answerKey,
    explanation: q.explanation ? q.explanation.slice(0, 5000) : null,
    difficulty: q.difficulty,
    topic: q.topic ? q.topic.slice(0, 200) : null,
    points: q.points,
    reviewStatus: reasons.length ? "NEEDS_REVIEW" : "READY",
    reviewNote: reasons.length ? reasons.join(". ").slice(0, 1000) : null,
  };
}
