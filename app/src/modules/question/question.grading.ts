/** Chấm điểm câu hỏi trắc nghiệm — hàm thuần, không đụng CSDL. */

export const QUESTION_TYPES = ["SINGLE_CHOICE", "TRUE_FALSE_GROUP", "SHORT_ANSWER"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Trắc nghiệm 1 đáp án",
  TRUE_FALSE_GROUP: "Đúng/Sai",
  SHORT_ANSWER: "Điền đáp án",
};
export const DIFFICULTY_LABEL: Record<string, string> = { EASY: "Dễ", MEDIUM: "Trung bình", HARD: "Khó" };

/** Cụm Đúng/Sai 4 ý: số ý đúng -> tỉ lệ điểm của câu (1 ý = 10%, 2 ý = 25%, 3 ý = 50%, 4 ý = 100%). */
export const TRUE_FALSE_SCALE: Record<number, number> = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1 };

export type AnswerKey = { mode: "NUMBER" | "TEXT"; answers: string[]; tolerance?: number };
export type GradableQuestion = {
  type: string;
  options: { id: string; isCorrect: boolean }[];
  answerKey: unknown;
};
export type GradeResult = { score: number; isCorrect: boolean };

const round = (n: number) => Math.round(n * 10000) / 10000;

/** "3,14" / " 3.14 " / "3 14" -> 3.14. Trả NaN nếu không phải số. */
export function parseNumber(raw: string): number {
  const s = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

const normText = (raw: string) => raw.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?]+$/, "");

export function readAnswerKey(value: unknown): AnswerKey {
  const k = (value ?? {}) as Partial<AnswerKey>;
  return {
    mode: k.mode === "NUMBER" ? "NUMBER" : "TEXT",
    answers: Array.isArray(k.answers) ? k.answers.map(String) : [],
    tolerance: typeof k.tolerance === "number" && k.tolerance >= 0 ? k.tolerance : 0,
  };
}

/** Chấm một câu. `answer` là dữ liệu học sinh gửi lên (chưa tin cậy): sai định dạng thì tính là chưa trả lời. */
export function gradeQuestion(question: GradableQuestion, answer: unknown, maxScore: number): GradeResult {
  const a = (answer && typeof answer === "object" ? answer : {}) as Record<string, unknown>;

  if (question.type === "SINGLE_CHOICE") {
    const picked = typeof a.optionId === "string" ? a.optionId : "";
    const ok = question.options.some((o) => o.id === picked && o.isCorrect);
    return { score: ok ? maxScore : 0, isCorrect: ok };
  }

  if (question.type === "TRUE_FALSE_GROUP") {
    const picks = (a.picks && typeof a.picks === "object" ? a.picks : {}) as Record<string, unknown>;
    const total = question.options.length;
    const right = question.options.filter((o) => typeof picks[o.id] === "boolean" && picks[o.id] === o.isCorrect).length;
    const ratio = total === 4 ? TRUE_FALSE_SCALE[right] : total ? right / total : 0;
    return { score: round(maxScore * ratio), isCorrect: total > 0 && right === total };
  }

  if (question.type === "SHORT_ANSWER") {
    const key = readAnswerKey(question.answerKey);
    const text = typeof a.text === "string" ? a.text : "";
    if (!text.trim()) return { score: 0, isCorrect: false };
    let ok: boolean;
    if (key.mode === "NUMBER") {
      const given = parseNumber(text);
      const tol = key.tolerance ?? 0;
      ok = Number.isFinite(given) && key.answers.some((x) => {
        const want = parseNumber(x);
        return Number.isFinite(want) && Math.abs(given - want) <= tol + Math.abs(want) * 1e-9;
      });
    } else {
      const given = normText(text);
      ok = key.answers.some((x) => normText(x) === given);
    }
    return { score: ok ? maxScore : 0, isCorrect: ok };
  }

  return { score: 0, isCorrect: false };
}

/** Điểm hệ 10 của cả bài từ điểm từng câu. */
export function toGrade10(earned: number, max: number): number {
  return max > 0 ? Math.round((earned / max) * 10 * 100) / 100 : 0;
}
