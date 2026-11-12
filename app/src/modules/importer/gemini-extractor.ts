import { EXTRACTION_SCHEMA, SYSTEM, coercePayload, ImportError, splitTextForAI, userPrompt, type ExtractInput, type ExtractedPayload, type Extractor } from "./extractor";

/** JSON Schema chuẩn -> lược đồ của Gemini: kiểu viết HOA, bỏ additionalProperties (Gemini không dùng). */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "additionalProperties") continue;
    out[k] = k === "type" && typeof v === "string" ? v.toUpperCase() : toGeminiSchema(v);
  }
  return out;
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Trích xuất bằng Google Gemini (gọi REST, không cần thư viện).
 * `fetchImpl` cho phép kiểm thử mà không gọi mạng thật.
 */
export function createGeminiExtractor(fetchImpl: typeof fetch = fetch): Extractor {
  async function call(apiKey: string, model: string, parts: Part[]): Promise<ExtractedPayload> {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: toGeminiSchema(EXTRACTION_SCHEMA), maxOutputTokens: 65536, temperature: 0.1 },
    });
    let res: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body, signal: AbortSignal.timeout(240_000),
      });
      if (res.status !== 429 && res.status < 500) break; // quá tải/lỗi máy chủ: thử lại một lần
      await new Promise((r) => setTimeout(r, 2500));
    }
    const data = (await res!.json().catch(() => ({}))) as GeminiResponse;
    if (!res!.ok) {
      const msg = data.error?.message ?? "";
      if (res!.status === 400 && /api key/i.test(msg)) throw new ImportError("Khóa AI (GEMINI_API_KEY) không hợp lệ.");
      if (res!.status === 401 || res!.status === 403) throw new ImportError("Khóa AI (GEMINI_API_KEY) không được phép dùng dịch vụ này. Hãy kiểm tra khóa và quyền truy cập.");
      if (res!.status === 404) throw new ImportError(`Mô hình AI "${model}" không tồn tại hoặc không khả dụng. Hãy kiểm tra GEMINI_MODEL.`);
      if (res!.status === 429) throw new ImportError("Dịch vụ AI đang quá tải hoặc hết hạn mức. Vui lòng thử lại sau ít phút.");
      throw new ImportError(`Dịch vụ AI báo lỗi (${res!.status}). Vui lòng thử lại sau.`);
    }
    if (data.promptFeedback?.blockReason) throw new ImportError("AI từ chối xử lý tài liệu này. Hãy kiểm tra nội dung tệp.");
    const cand = data.candidates?.[0];
    if (cand?.finishReason === "MAX_TOKENS") throw new ImportError("Tài liệu quá dài nên AI không trích xuất hết được. Hãy tách tệp thành các phần nhỏ hơn rồi nhập lại.");
    if (cand?.finishReason === "SAFETY" || cand?.finishReason === "PROHIBITED_CONTENT") throw new ImportError("AI từ chối xử lý tài liệu này. Hãy kiểm tra nội dung tệp.");
    const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new ImportError("AI không trả về kết quả. Vui lòng thử lại.");
    try { return coercePayload(JSON.parse(text)); } catch { throw new ImportError("AI trả về dữ liệu không đọc được. Vui lòng thử lại."); }
  }

  return async (input: ExtractInput) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new ImportError("Chưa cấu hình khóa AI (GEMINI_API_KEY). Vui lòng liên hệ quản trị viên.");
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    try {
      const src = input.source;
      if (src.type === "pdf" || src.type === "image") {
        return await call(apiKey, model, [{ inlineData: { mimeType: src.type === "pdf" ? "application/pdf" : src.mime, data: src.data.toString("base64") } }, { text: userPrompt(input) }]);
      }
      const chunks = splitTextForAI(src.text);
      const merged: ExtractedPayload = { testTitle: "", warnings: [], questions: [] };
      for (const [i, c] of chunks.entries()) {
        const part = await call(apiKey, model, [{ text: userPrompt(input, { ...c, index: i + 1, total: chunks.length }) }]);
        merged.testTitle ||= part.testTitle;
        merged.warnings.push(...part.warnings);
        merged.questions.push(...part.questions);
      }
      return merged;
    } catch (e) {
      if (e instanceof ImportError) throw e;
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new ImportError("AI phản hồi quá lâu. Hãy thử tệp nhỏ hơn hoặc thử lại sau.");
      throw new ImportError("Không kết nối được dịch vụ AI. Vui lòng thử lại sau.");
    }
  };
}

export const geminiExtractor: Extractor = createGeminiExtractor();
