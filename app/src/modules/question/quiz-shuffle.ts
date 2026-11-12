/**
 * Xáo trộn đề theo từng học sinh: cùng một đề nhưng mỗi học sinh một thứ tự câu hỏi và đáp án.
 * Dùng bộ sinh số ngẫu nhiên có "hạt giống" (bài tập + học sinh) nên tải lại trang vẫn ra đúng thứ tự cũ,
 * và giáo viên xem lại bài làm đúng như học sinh đã thấy. Chấm điểm theo mã đáp án nên không bị ảnh hưởng.
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
/** Bộ sinh số ngẫu nhiên [0, 1) cố định theo hạt giống (mulberry32). */
export function seededRandom(seed: string): () => number {
  let a = xmur3(seed)();
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffleSeeded<T>(items: readonly T[], seed: string): T[] {
  const rnd = seededRandom(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Đáp án tham chiếu đáp án khác ("Cả A và B", "Tất cả các đáp án trên"...) thì đổi thứ tự sẽ làm sai nghĩa: không xáo các đáp án của câu đó. */
const REFERS = /(\bcả\b[^.]{0,30}\b[a-d]\b|tất cả các (đáp án|ý|phương án)|không có (đáp án|ý|phương án) nào|\b[a-d]\s*(và|,|hoặc)\s*[a-d]\b|(đáp án|ý|phương án) (trên|nào ở trên)|\bcả (hai|ba|bốn)\b)/i;
export const canShuffleOptions = (options: { content: string }[]) => !options.some((o) => REFERS.test(o.content));

type Item = { question: { id: string; type: string; options: { label: string; content: string }[] } };

/** Sắp lại đề cho một học sinh. Nhãn đáp án (A, B, C… / a, b, c…) được đánh lại theo vị trí mới. */
export function arrangeForStudent<I extends Item>(items: I[], flags: { questions: boolean; options: boolean }, seed: string): I[] {
  let out = items;
  if (flags.questions) out = shuffleSeeded(out, `${seed}:questions`);
  if (!flags.options) return out;
  return out.map((it) => {
    const q = it.question;
    if ((q.type !== "SINGLE_CHOICE" && q.type !== "TRUE_FALSE_GROUP") || q.options.length < 2 || !canShuffleOptions(q.options)) return it;
    const letters = q.type === "TRUE_FALSE_GROUP" ? "abcdefgh" : "ABCDEFGH";
    const options = shuffleSeeded(q.options, `${seed}:options:${(q as { id: string }).id}`).map((o, i) => ({ ...o, label: letters[i] ?? o.label }));
    return { ...it, question: { ...q, options } };
  });
}
