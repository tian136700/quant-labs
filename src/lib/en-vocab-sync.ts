import type { EnVocabWord } from "@/lib/types";

/** 页面可见时增量拉取间隔（备注等多端实时同步） */
export const JP_VOCAB_POLL_MS = 3_000;

/** 标签页在后台时降频，避免浪费 Worker 配额 */
export const JP_VOCAB_POLL_HIDDEN_MS = 10_000;

export function maxEnVocabUpdatedAt(words: EnVocabWord[]): string {
  let max = "";
  for (const w of words) {
    if (w.updated_at > max) max = w.updated_at;
  }
  return max;
}

/** 用服务端较新的词条补丁合并本地列表（按 updated_at） */
export function mergeEnVocabSyncPatches(
  current: EnVocabWord[],
  patches: EnVocabWord[]
): EnVocabWord[] {
  if (!patches.length) return current;
  const byId = new Map(patches.map((w) => [w.id, w]));
  return current.map((w) => {
    const patch = byId.get(w.id);
    if (!patch || patch.updated_at <= w.updated_at) return w;
    return { ...w, ...patch };
  });
}
