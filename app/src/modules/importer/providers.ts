import { anthropicExtractor, ImportError, type Extractor } from "./extractor";
import { geminiExtractor } from "./gemini-extractor";

/**
 * Chọn nhà cung cấp AI: AI_PROVIDER=gemini|anthropic nếu đặt rõ; nếu không thì theo khóa có sẵn (Gemini ưu tiên).
 * Chưa có khóa nào thì báo lỗi hướng dẫn cấu hình.
 */
export function pickProvider(env: Readonly<Record<string, string | undefined>> = process.env): "gemini" | "anthropic" | null {
  const forced = env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini" || forced === "anthropic") return forced;
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export const defaultExtractor: Extractor = async (input) => {
  const provider = pickProvider();
  if (provider === "anthropic") return anthropicExtractor(input);
  if (provider === "gemini") return geminiExtractor(input);
  throw new ImportError("Chưa cấu hình khóa AI (GEMINI_API_KEY). Vui lòng liên hệ quản trị viên.");
};
