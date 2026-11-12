import assert from "node:assert/strict";
import { test } from "node:test";
import { ImportError, type ExtractInput } from "../src/modules/importer/extractor";
import { createGeminiExtractor, toGeminiSchema } from "../src/modules/importer/gemini-extractor";
import { pickProvider } from "../src/modules/importer/providers";

type Body = { contents: { parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[]; generationConfig: { responseMimeType: string; responseSchema: { type: string } } };
const restore = (name: "GEMINI_API_KEY" | "GEMINI_MODEL", v: string | undefined) => { if (v === undefined) delete process.env[name]; else process.env[name] = v; };
const ok = (payload: unknown, finishReason = "STOP") => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });
const input = (source: ExtractInput["source"]): ExtractInput => ({ kind: "QUESTIONS", fileName: "de.docx", subjectName: "Vật lý", gradeName: "Khối 10", source });
const text: ExtractInput["source"] = { type: "text", text: "Câu 1. Đơn vị vận tốc?\nA. m\nB. m/s", imageCount: 0 };
const withKey = async (fn: () => Promise<void>) => { const s = process.env.GEMINI_API_KEY, m = process.env.GEMINI_MODEL; process.env.GEMINI_API_KEY = "test-key"; delete process.env.GEMINI_MODEL; try { await fn(); } finally { restore("GEMINI_API_KEY", s); restore("GEMINI_MODEL", m); } };

test("lược đồ gửi Gemini: kiểu viết HOA, bỏ additionalProperties", () => {
  const out = toGeminiSchema({ type: "object", additionalProperties: false, properties: { a: { type: "array", items: { type: "string", enum: ["X"] } } } }) as Record<string, unknown>;
  assert.equal(out.type, "OBJECT"); assert.ok(!("additionalProperties" in out));
  assert.deepEqual((out.properties as { a: { items: unknown } }).a.items, { type: "STRING", enum: ["X"] });
});

test("gửi đúng yêu cầu tới Gemini và đọc kết quả có cấu trúc", () => withKey(async () => {
  let url = "", headers: Record<string, string> = {}, body!: Body;
  const extract = createGeminiExtractor((async (u: string, init: RequestInit) => { url = u; headers = init.headers as Record<string, string>; body = JSON.parse(String(init.body)); return ok({ testTitle: "", warnings: ["w"], questions: [{ type: "SINGLE_CHOICE", content: "Đơn vị vận tốc?", options: [{ content: "m", isCorrect: false }, { content: "m/s", isCorrect: true }], answerSource: "FILE", confidence: 0.9 }] }); }) as typeof fetch);
  const r = await extract(input(text));
  assert.match(url, /\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(headers["x-goog-api-key"], "test-key");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.responseSchema.type, "OBJECT");
  assert.match(body.contents[0].parts[0].text ?? "", /Câu 1\./);
  assert.equal(r.questions.length, 1); assert.equal(r.questions[0].options[1].isCorrect, true); assert.deepEqual(r.warnings, ["w"]);
}));

test("PDF và ảnh gửi dưới dạng inlineData; GEMINI_MODEL ghi đè mô hình", () => withKey(async () => {
  process.env.GEMINI_MODEL = "gemini-x";
  const seen: Body[] = []; let url = "";
  try {
    const extract = createGeminiExtractor((async (u: string, init: RequestInit) => { url = u; seen.push(JSON.parse(String(init.body))); return ok({ testTitle: "", warnings: [], questions: [] }); }) as typeof fetch);
    await extract(input({ type: "pdf", data: Buffer.from("%PDF-1"), mime: "application/pdf" }));
    await extract(input({ type: "image", data: Buffer.from("png"), mime: "image/png" }));
    assert.match(url, /models\/gemini-x:generateContent/);
    assert.equal(seen[0].contents[0].parts[0].inlineData?.mimeType, "application/pdf");
    assert.equal(seen[1].contents[0].parts[0].inlineData?.mimeType, "image/png");
    assert.equal(seen[0].contents[0].parts[0].inlineData?.data, Buffer.from("%PDF-1").toString("base64"));
  } finally { delete process.env.GEMINI_MODEL; }
}));

test("báo lỗi tiếng Việt rõ ràng: thiếu khóa, khóa sai, hết hạn mức, quá dài, bị chặn, mô hình không có", async () => {
  const saved = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  await assert.rejects(createGeminiExtractor()(input(text)), (e: unknown) => e instanceof ImportError && e.message.includes("GEMINI_API_KEY"));
  process.env.GEMINI_API_KEY = "k";
  try {
    const fail = (status: number, message = "") => createGeminiExtractor((async () => new Response(JSON.stringify({ error: { message } }), { status })) as typeof fetch)(input(text));
    await assert.rejects(fail(400, "API key not valid. Please pass a valid API key."), /không hợp lệ/);
    await assert.rejects(fail(403), /không được phép/);
    await assert.rejects(fail(404), /không tồn tại/);
    await assert.rejects(createGeminiExtractor((async () => ok({ questions: [] }, "MAX_TOKENS")) as typeof fetch)(input(text)), /quá dài/);
    await assert.rejects(createGeminiExtractor((async () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 })) as typeof fetch)(input(text)), /từ chối/);
    await assert.rejects(createGeminiExtractor((async () => new Response("not json", { status: 200 })) as typeof fetch)(input(text)), /không trả về kết quả/);
    await assert.rejects(createGeminiExtractor((async () => { throw new TypeError("fetch failed"); }) as typeof fetch)(input(text)), /Không kết nối/);
  } finally { restore("GEMINI_API_KEY", saved); }
});

test("chọn nhà cung cấp: đặt rõ > Gemini > Anthropic > chưa cấu hình", () => {
  assert.equal(pickProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" }), "gemini");
  assert.equal(pickProvider({ ANTHROPIC_API_KEY: "a" }), "anthropic");
  assert.equal(pickProvider({ GEMINI_API_KEY: "g", AI_PROVIDER: "anthropic" }), "anthropic");
  assert.equal(pickProvider({ AI_PROVIDER: "GEMINI" }), "gemini");
  assert.equal(pickProvider({}), null);
});
