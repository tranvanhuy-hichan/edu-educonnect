import Anthropic from "@anthropic-ai/sdk";

/** Lỗi cấu hình/giới hạn: thông báo tiếng Việt, hiển thị thẳng cho giáo viên. */
export class ImportError extends Error {
  constructor(message: string) { super(message); this.name = "ImportError"; }
}

export type ExtractedOption = { content: string; isCorrect: boolean; imageRefs: number[] };
export type ExtractedQuestion = {
  type: "SINGLE_CHOICE" | "TRUE_FALSE_GROUP" | "SHORT_ANSWER";
  content: string;
  imageRefs: number[];
  options: ExtractedOption[];
  answerKey: { mode: "NUMBER" | "TEXT"; answers: string[]; tolerance: number };
  explanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topic: string;
  answerSource: "FILE" | "AI_SOLVED" | "UNKNOWN";
  needsFigure: boolean;
  points: number;
  confidence: number;
  note: string;
};
export type ExtractedPayload = { testTitle: string; warnings: string[]; questions: ExtractedQuestion[] };

export type ExtractInput = {
  kind: "QUESTIONS" | "TEST";
  fileName: string;
  subjectName: string;
  gradeName: string;
  source: { type: "text"; text: string; imageCount: number } | { type: "pdf"; data: Buffer; mime: string } | { type: "image"; data: Buffer; mime: string };
};
/** Hàm trích xuất có thể thay thế (kiểm thử truyền bản giả vào `runImportJob`). */
export type Extractor = (input: ExtractInput) => Promise<ExtractedPayload>;

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const refs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x > 0) : []);
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);

/** Chuẩn hóa JSON do AI trả về: không tin kiểu dữ liệu, loại phần tử không dùng được. */
export function coercePayload(raw: unknown): ExtractedPayload {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.questions) ? r.questions : [];
  const questions = list.filter((q) => q && typeof q === "object").map((q): ExtractedQuestion => {
    const x = q as Record<string, unknown>;
    const key = (x.answerKey && typeof x.answerKey === "object" ? x.answerKey : {}) as Record<string, unknown>;
    return {
      type: oneOf(x.type, ["SINGLE_CHOICE", "TRUE_FALSE_GROUP", "SHORT_ANSWER"], "SINGLE_CHOICE"),
      content: str(x.content).trim(),
      imageRefs: refs(x.imageRefs),
      options: (Array.isArray(x.options) ? x.options : []).filter((o) => o && typeof o === "object").map((o) => {
        const y = o as Record<string, unknown>;
        return { content: str(y.content).trim(), isCorrect: y.isCorrect === true, imageRefs: refs(y.imageRefs) };
      }),
      answerKey: {
        mode: oneOf(key.mode, ["NUMBER", "TEXT"], "TEXT"),
        answers: (Array.isArray(key.answers) ? key.answers : []).map((a) => (typeof a === "number" && Number.isFinite(a) ? String(a) : str(a)).trim()).filter(Boolean),
        tolerance: Math.max(0, num(key.tolerance, 0)),
      },
      explanation: str(x.explanation).trim(),
      difficulty: oneOf(x.difficulty, ["EASY", "MEDIUM", "HARD"], "MEDIUM"),
      topic: str(x.topic).trim(),
      answerSource: oneOf(x.answerSource, ["FILE", "AI_SOLVED", "UNKNOWN"], "UNKNOWN"),
      needsFigure: x.needsFigure === true,
      points: num(x.points, 1) > 0 ? num(x.points, 1) : 1,
      confidence: Math.min(1, Math.max(0, num(x.confidence, 0.5))),
      note: str(x.note).trim(),
    };
  });
  return { testTitle: str(r.testTitle).trim(), warnings: (Array.isArray(r.warnings) ? r.warnings : []).map((w) => str(w)).filter(Boolean), questions };
}

/**
 * Chia văn bản dài theo ranh giới câu hỏi ("Câu 12.", "Bài 3:"...). Phần cuối tài liệu (thường là bảng đáp án)
 * được đính kèm mỗi đoạn dưới dạng tham chiếu để AI ghép đáp án.
 */
export function splitTextForAI(text: string, max = 45000, tail = 6000): { body: string; reference: string }[] {
  if (text.length <= max) return [{ body: text, reference: "" }];
  const starts = [...text.matchAll(/^(?=(?:Câu|Bài|Question)\s*\d+\s*[.:)])/gim)].map((m) => m.index ?? 0);
  const cuts = starts.length > 1 ? starts : [];
  const reference = text.slice(-tail);
  const chunks: string[] = [];
  let from = 0;
  if (!cuts.length) {
    for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
  } else {
    let last = 0;
    for (const c of [...cuts, text.length]) {
      if (c - from > max && last > from) { chunks.push(text.slice(from, last)); from = last; }
      last = c;
    }
    if (from < text.length) chunks.push(text.slice(from));
  }
  return chunks.map((body) => ({ body, reference: body === chunks[chunks.length - 1] ? "" : reference }));
}

const optionSchema = {
  type: "object", additionalProperties: false, required: ["content", "isCorrect", "imageRefs"],
  properties: { content: { type: "string" }, isCorrect: { type: "boolean" }, imageRefs: { type: "array", items: { type: "integer" } } },
};
export const EXTRACTION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["testTitle", "warnings", "questions"],
  properties: {
    testTitle: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["type", "content", "imageRefs", "options", "answerKey", "explanation", "difficulty", "topic", "answerSource", "needsFigure", "points", "confidence", "note"],
        properties: {
          type: { type: "string", enum: ["SINGLE_CHOICE", "TRUE_FALSE_GROUP", "SHORT_ANSWER"] },
          content: { type: "string" },
          imageRefs: { type: "array", items: { type: "integer" } },
          options: { type: "array", items: optionSchema },
          answerKey: {
            type: "object", additionalProperties: false, required: ["mode", "answers", "tolerance"],
            properties: { mode: { type: "string", enum: ["NUMBER", "TEXT"] }, answers: { type: "array", items: { type: "string" } }, tolerance: { type: "number" } },
          },
          explanation: { type: "string" },
          difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
          topic: { type: "string" },
          answerSource: { type: "string", enum: ["FILE", "AI_SOLVED", "UNKNOWN"] },
          needsFigure: { type: "boolean" },
          points: { type: "number" },
          confidence: { type: "number" },
          note: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM = `Bạn là trợ lý số hóa đề kiểm tra và ngân hàng câu hỏi cho giáo viên phổ thông Việt Nam. Nhiệm vụ: đọc tài liệu giáo viên tải lên và trích xuất TỪNG CÂU HỎI thành dữ liệu có cấu trúc.

Nguyên tắc bắt buộc:
- Không bịa nội dung. Giữ nguyên chữ của đề, chỉ sửa lỗi gõ hiển nhiên. Không tự thêm hay bớt câu hỏi.
- Công thức Toán/Lý/Hóa viết bằng LaTeX đặt trong $...$ (công thức đã ở dạng $...$ trong văn bản thì giữ nguyên). Công thức hóa học dùng \\ce{...}, ví dụ $\\ce{2H2 + O2 -> 2H2O}$. Ký hiệu độ: $^\\circ$.
- Phân loại mỗi câu đúng một trong ba loại:
  • SINGLE_CHOICE: trắc nghiệm chọn một đáp án, 2 đến 6 lựa chọn. Bỏ nhãn "A.", "B." khỏi nội dung đáp án. Đúng một đáp án có isCorrect=true.
  • TRUE_FALSE_GROUP: cụm Đúng/Sai gồm một câu dẫn và ĐÚNG 4 ý a, b, c, d. Bỏ nhãn "a)". Mỗi ý có isCorrect=true nếu ý đó ĐÚNG, false nếu SAI.
  • SHORT_ANSWER: câu trả lời ngắn, học sinh điền đáp án. options để mảng rỗng. answerKey.mode là NUMBER nếu đáp án là một số (answers chứa số dạng 3,14 hoặc 3.14, tolerance là sai số cho phép nếu đề nêu, mặc định 0), TEXT nếu đáp án là chữ (liệt kê các cách viết chấp nhận được).
  Với câu không phải SHORT_ANSWER thì answerKey = {mode:"TEXT", answers:[], tolerance:0}.
- Đáp án đúng: nếu tài liệu có bảng/phần đáp án hoặc hướng dẫn chấm thì ghép đúng đáp án cho từng câu và đặt answerSource="FILE". Chữ gạch chân <u>...</u> trong tài liệu có thể là dấu hiệu đáp án đúng; chỉ dùng cách này khi không có bảng đáp án và đặt answerSource="FILE" nếu thật sự chắc chắn. Nếu tài liệu KHÔNG có đáp án, hãy tự giải và đặt answerSource="AI_SOLVED"; nếu không giải được thì answerSource="UNKNOWN" (để isCorrect=false hết, answers rỗng). Không giả vờ tài liệu có đáp án.
- Lời giải/giải thích (explanation): chỉ chép từ tài liệu nếu có, nếu không có thì để chuỗi rỗng.
- Ảnh: văn bản chứa dấu [[IMG:n]] đánh dấu vị trí ảnh nhúng. Đưa n của ảnh thuộc câu hỏi vào imageRefs của câu, ảnh thuộc từng đáp án vào imageRefs của đáp án đó, và XÓA dấu [[IMG:n]] khỏi nội dung chữ. Nếu câu cần hình vẽ/đồ thị/sơ đồ/bảng mà bạn không có ảnh để tham chiếu (ví dụ tài liệu là PDF hoặc ảnh chụp) thì đặt needsFigure=true và ghi rõ trong note.
- Đoạn văn kèm nhiều câu hỏi (đọc hiểu, Tiếng Anh): hệ thống chưa hỗ trợ đoạn văn chung, nên lặp lại đoạn văn ở đầu nội dung của mỗi câu con.
- Câu tự luận (học sinh viết lời giải dài) không nhập được: bỏ qua và ghi vào warnings, nêu số thứ tự câu.
- difficulty: ước lượng EASY, MEDIUM hoặc HARD. topic: chương/bài nếu tài liệu nêu, nếu không thì chuỗi rỗng. points: số điểm của câu nếu đề ghi rõ, nếu không thì 1. confidence từ 0 đến 1: mức chắc chắn về việc đã trích xuất đúng (kể cả đáp án). note: ghi chú ngắn bằng tiếng Việt khi có điều đáng ngờ, nếu không thì rỗng.
- warnings: những điều giáo viên cần biết (câu bỏ qua, phần không đọc được, tài liệu không phải đề...).
- Giữ nguyên thứ tự các câu như trong tài liệu.`;

function userPrompt(input: ExtractInput, chunk?: { body: string; reference: string; index: number; total: number }) {
  const head = `Môn: ${input.subjectName}. Khối: ${input.gradeName}. Tên tệp: ${input.fileName}.`;
  const mode = input.kind === "TEST"
    ? "Đây là MỘT ĐỀ KIỂM TRA. Hãy điền testTitle (tên đề như trong tài liệu, nếu không có thì để rỗng) và points của từng câu theo thang điểm của đề nếu có."
    : "Đây là một TẬP CÂU HỎI. testTitle để rỗng.";
  if (!chunk) return `${head}\n${mode}\nHãy trích xuất toàn bộ câu hỏi trong tài liệu đính kèm.`;
  return [
    head, mode,
    chunk.total > 1 ? `Tài liệu dài nên được chia ${chunk.total} phần; đây là phần ${chunk.index}/${chunk.total}. Chỉ trích xuất các câu hỏi nằm trong phần này.` : "",
    "=== NỘI DUNG TÀI LIỆU ===", chunk.body,
    chunk.reference ? `=== PHẦN CUỐI TÀI LIỆU (chỉ để tham chiếu đáp án, KHÔNG trích xuất câu hỏi từ phần này) ===\n${chunk.reference}` : "",
    input.source.type === "text" && input.source.imageCount ? `(Tài liệu có ${input.source.imageCount} ảnh nhúng, đánh số [[IMG:1]]..[[IMG:${input.source.imageCount}]].)` : "",
  ].filter(Boolean).join("\n\n");
}

async function callModel(client: Anthropic, content: Anthropic.MessageParam["content"]): Promise<ExtractedPayload> {
  const message = await client.messages.stream({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    max_tokens: 64000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    messages: [{ role: "user", content }],
  }).finalMessage();
  if (message.stop_reason === "refusal") throw new ImportError("AI từ chối xử lý tài liệu này. Hãy kiểm tra nội dung tệp.");
  if (message.stop_reason === "max_tokens") throw new ImportError("Tài liệu quá dài nên AI không trích xuất hết được. Hãy tách tệp thành các phần nhỏ hơn rồi nhập lại.");
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) throw new ImportError("AI không trả về kết quả. Vui lòng thử lại.");
  try { return coercePayload(JSON.parse(block.text)); } catch { throw new ImportError("AI trả về dữ liệu không đọc được. Vui lòng thử lại."); }
}

/** Trích xuất bằng Claude. Văn bản dài được chia nhiều lượt rồi gộp lại. */
export const anthropicExtractor: Extractor = async (input) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ImportError("Chưa cấu hình khóa AI (ANTHROPIC_API_KEY). Vui lòng liên hệ quản trị viên.");
  const client = new Anthropic({ apiKey });
  try {
    const src = input.source;
    if (src.type === "pdf") {
      return await callModel(client, [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: src.data.toString("base64") } }, { type: "text", text: userPrompt(input) }]);
    }
    if (src.type === "image") {
      const mime = src.mime as "image/png" | "image/jpeg" | "image/webp";
      return await callModel(client, [{ type: "image", source: { type: "base64", media_type: mime, data: src.data.toString("base64") } }, { type: "text", text: userPrompt(input) }]);
    }
    const chunks = splitTextForAI(src.text);
    const merged: ExtractedPayload = { testTitle: "", warnings: [], questions: [] };
    for (const [i, c] of chunks.entries()) {
      const part = await callModel(client, userPrompt(input, { ...c, index: i + 1, total: chunks.length }));
      merged.testTitle ||= part.testTitle;
      merged.warnings.push(...part.warnings);
      merged.questions.push(...part.questions);
    }
    return merged;
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ImportError("Khóa AI (ANTHROPIC_API_KEY) không hợp lệ.");
    if (e instanceof Anthropic.RateLimitError) throw new ImportError("Dịch vụ AI đang quá tải hoặc hết hạn mức. Vui lòng thử lại sau ít phút.");
    if (e instanceof Anthropic.APIError) throw new ImportError(`Dịch vụ AI báo lỗi (${e.status ?? "kết nối"}). Vui lòng thử lại sau.`);
    throw e;
  }
};
