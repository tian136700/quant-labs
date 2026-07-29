import type { EnVocabWord } from "@/lib/types";

/** 学生复习页：共享列表轮询（对齐 jp-vocab study，禁止 <5s） */
/** 学生今日单词：可见 5s 拉 shared，课堂勾选后尽快弹卡 */
export const EN_VOCAB_STUDY_POLL_MS = 5_000;

/** 学生复习页：后台轮询 */
export const EN_VOCAB_STUDY_POLL_HIDDEN_MS = 45_000;

/** 老师抽查卡：轮询学生是否已自行查看当前词 */
export const EN_VOCAB_QUIZ_LIVE_POLL_MS = 8_000;

/** 学生端：轮询老师当前 live 词（peek 按钮变灰） */
export const EN_VOCAB_STUDY_QUIZ_LIVE_POLL_MS = 15_000;

/** 学生端：后台 live 轮询 */
export const EN_VOCAB_STUDY_QUIZ_LIVE_POLL_HIDDEN_MS = 45_000;

/** 页面可见时增量拉取间隔（备注等多端实时同步） */
export const JP_VOCAB_POLL_MS = 5_000;

/** 标签页在后台时降频，避免浪费 Worker 配额 */
export const JP_VOCAB_POLL_HIDDEN_MS = 20_000;

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
