/** Chọn câu hỏi ngẫu nhiên cho bài ôn tập — hàm thuần, kiểm thử được. */

export type PoolQuestion = { id: string; lessonId: string | null; difficulty: string };
export type PickSpec = {
  /** Tổng số câu cần lấy (dùng khi không chỉ định số câu theo từng bài). */
  total?: number;
  /** Số câu theo từng bài học (ưu tiên hơn `total`). */
  perLesson?: Record<string, number>;
  /** Tỉ lệ độ khó, vd { EASY: 4, MEDIUM: 4, HARD: 2 } (không bắt buộc, chỉ là tỉ lệ tương đối). */
  difficulty?: Partial<Record<"EASY" | "MEDIUM" | "HARD", number>>;
};
export type PickResult = { ids: string[]; shortage: string[] };

export function shuffle<T>(items: readonly T[], rnd: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Chia `total` cho `n` phần đều nhau, phần dư dồn cho các phần đầu. */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n), extra = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Chia số câu `n` theo tỉ lệ độ khó (phương pháp phần dư lớn nhất). */
export function difficultyQuotas(n: number, ratio?: PickSpec["difficulty"]): Record<string, number> {
  const keys = ["EASY", "MEDIUM", "HARD"] as const;
  const weights = keys.map((k) => Math.max(0, ratio?.[k] ?? 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return {};
  const raw = weights.map((w) => (w / sum) * n);
  const floor = raw.map(Math.floor);
  let left = n - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left-- > 0) floor[i]++; }
  return Object.fromEntries(keys.map((k, i) => [k, floor[i]]));
}

function pickFrom(pool: PoolQuestion[], n: number, ratio: PickSpec["difficulty"], rnd: () => number): PoolQuestion[] {
  const take = Math.min(n, pool.length);
  const quota = difficultyQuotas(take, ratio);
  const chosen: PoolQuestion[] = [];
  const left = shuffle(pool, rnd);
  for (const [d, q] of Object.entries(quota)) {
    for (let i = 0; i < q; i++) {
      const idx = left.findIndex((x) => x.difficulty === d);
      if (idx >= 0) chosen.push(...left.splice(idx, 1));
    }
  }
  while (chosen.length < take && left.length) chosen.push(left.shift()!); // thiếu câu đúng độ khó thì bù bằng câu bất kỳ
  return chosen;
}

/** Bốc câu theo số lượng từng bài + tỉ lệ độ khó. Không đủ câu thì lấy hết có thể và báo thiếu. */
export function pickQuestions(pool: PoolQuestion[], lessonIds: string[], spec: PickSpec, rnd: () => number = Math.random): PickResult {
  const quotas: Record<string, number> = spec.perLesson ? { ...spec.perLesson } : Object.fromEntries(lessonIds.map((id, i) => [id, splitEvenly(spec.total ?? 0, lessonIds.length)[i]]));
  const ids: string[] = [], shortage: string[] = [];
  for (const lessonId of lessonIds) {
    const want = Math.max(0, Math.floor(quotas[lessonId] ?? 0));
    if (!want) continue;
    const got = pickFrom(pool.filter((q) => q.lessonId === lessonId), want, spec.difficulty, rnd);
    ids.push(...got.map((q) => q.id));
    if (got.length < want) shortage.push(`${lessonId}:${want - got.length}`);
  }
  return { ids, shortage };
}
