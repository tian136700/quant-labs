import type { JpVocabWord } from "@/lib/types";

/** 页面可见时增量拉取间隔（备注等多端实时同步） */
export const JP_VOCAB_POLL_MS = 5_000;

/** 标签页在后台时降频，避免浪费 Worker 配额 */
export const JP_VOCAB_POLL_HIDDEN_MS = 15_000;

/** 老师抽查卡片：学生是否自行查看（低频即可） */
export const JP_VOCAB_QUIZ_LIVE_POLL_MS = 6_000;

/** 今日抽查目标跨域名同步（D1 读取，不必与词条补丁同频） */
export const JP_VOCAB_TEACHER_VISIBLE_POLL_MS = 20_000;

/** 学生复习页：共享列表轮询（比老师端略慢，减轻 Worker CPU） */
export const JP_VOCAB_STUDY_POLL_MS = 10_000;

/** 学生复习页：后台轮询 */
export const JP_VOCAB_STUDY_POLL_HIDDEN_MS = 25_000;

/** 学生复习页：每隔 N 次列表轮询再拉一次抽查进度 */
export const JP_VOCAB_STUDY_QUIZ_EVERY_N = 8;

export function maxJpVocabUpdatedAt(words: JpVocabWord[]): string {
  let max = "";
  for (const w of words) {
    if (w.updated_at > max) max = w.updated_at;
  }
  return max;
}

/** 用服务端较新的词条补丁合并本地列表（按 updated_at） */
export function mergeJpVocabSyncPatches(
  current: JpVocabWord[],
  patches: JpVocabWord[]
): JpVocabWord[] {
  if (!patches.length) return current;
  const byId = new Map(patches.map((w) => [w.id, w]));
  return current.map((w) => {
    const patch = byId.get(w.id);
    if (!patch || patch.updated_at <= w.updated_at) return w;
    return { ...w, ...patch };
  });
}
